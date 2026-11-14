# PLAN — implement "gitello" from scratch

`gitello` is a small kanban-style tool: lists containing cards, stored as plain files
inside a dedicated git repository, driven by a CLI and an interactive terminal UI (TUI).

This plan is self-contained: everything needed to build the project in a single session
is described below.

## 1. Toolchain and package setup

- Node.js v22 (pin it in `.nvmrc` and in `package.json` `engines.node` as `"22.x"`;
  the CI workflow must also use `node-version: 22`).
- pnpm as the package manager, pinned via the `packageManager` field in `package.json`
  (corepack). After `pnpm install`, the package's binary must be linked onto `PATH`.
- `package.json` for a package named `gitello` with a `bin` entry pointing at
  `bin/gitello.js` (a `#!/usr/bin/env node` script), so installing the package exposes
  a `gitello` command.
- Scripts in `package.json`:
  - `check`: verify formatting with Prettier (`prettier --check .`) and then run the
    test suite with Node's built-in test runner (`node --test`). It must be invoked as
    `pnpm run check` (pnpm does not run package scripts by their bare name).
  - `format`: `prettier --write .` to format the code before committing.
- Prettier configuration (`.prettierrc`, `.prettierignore`) so that `prettier --check .`
  passes on all tracked files.
- A GitHub Actions workflow (`.github/workflows/ci.yml`) that sets up Node 22 and pnpm
  (from the `packageManager` field) and runs `pnpm run check` on every push / when a
  pull request is created or updated.
- Prefer Node.js built-in APIs (`node:*` modules) over external dependencies, unless a
  built-in would require a lot of extra code. The only intended external dependency is
  the TUI library (see §6).
- Tests use `node --test` (built-in runner), live under `test/`, and must run against a
  temporary directory via the `GITELLO_PATH` env var so they never touch a real repo.

## 2. Storage model

- Unless overridden by the `GITELLO_PATH` environment variable, gitello expects its data
  git repo at `~/.gitello`. On the first use of any command, the repo is created and is
  empty (`git init`, with a repo-local git identity fallback so commits work even without
  global git config).
- Each folder in this repo represents a "list". Each JSON file in a folder represents a
  "card".
- A card JSON contains: `title`, `description`, `comments` (array), `createdAt`,
  `updatedAt`.
- The card's file name is a sanitized version of its title (`<sanitized-title>.json`),
  with a unique numeric suffix (`-2`, `-3`, ...) added on filename collision.
- There is no automatic push/pull. Instead, every mutation auto-commits only its own
  path(s): `git add -- <path>` + `git commit -m <message> -- <path>`. Committing a
  commit that spans several paths (e.g. a move = delete + add) must be a single commit.
- When creating a list, also write a `.gitkeep` file into the folder so the folder can be
  stored in git.
- `gitello git <args...>` proxies git commands into the data repo (for pull/push/manual
  fixes) and passes through the exit code.

## 3. CLI

Thin entry point `bin/gitello.js` → parsing in `src/cli.js` → command implementations in
`src/commands.js`, with `src/store.js` (repo/git handling) and `src/cards.js` (card model)
behind them. Node built-ins only.

Commands (multi-word titles/names must be passed as a single quoted argument; otherwise
an error telling the user to quote multi-word values is printed):

- `gitello lists` — print the name of each list, one per line.
- `gitello lists create <name>` — create a new list (folder + `.gitkeep`, auto-commit).
- `gitello lists remove <name>` — remove a list (auto-commit).
- `gitello cards` — print the titles of the ten most recently created/modified cards
  (most recent first, by `updatedAt`).
- `gitello cards --all` — print the titles of all existing cards.
- `gitello cards <list>` — print the title of every card in the given list (creation
  order).
- `gitello cards <list> create <title>` — create a card with the given title in the given
  list (auto-commit; sets `createdAt`/`updatedAt`).
- `gitello cards <list> remove <title>` — remove the card(s) with that title from the
  list (auto-commit).
- `gitello cards <from_list> move <title> <to_list>` — move card(s) between lists. Prints
  one `Moved card ...` line per moved card and creates a single git commit. Validates both
  lists, rejects missing cards, same-list moves, and wrong argument counts. If the target
  list already contains the same filename, pick a fresh one (`-2`, `-3`, ...).
- `gitello cards show <title>` — print the content of the card(s) with that title,
  searching all lists (most recent first), in this format:

  ```
  <title>

  <description>

  created: <created_timestamp>
  modified: <modified_timestamp>
  other: <other_metadata_if_available>

  ...comments...
  ```

  The `other:` line (a JSON object of any metadata beyond the known fields) is only
  printed when such extra metadata exists. Comments are printed one per line (strings
  as-is, objects as JSON).

- `gitello git <args...>` — proxy to git in the data repo (see §2).

Behavior:

- Errors (unknown list/card, duplicate list, invalid names, unquoted multi-word values,
  wrong argument counts) go to stderr with exit code 1.
- Unknown commands print usage. Usage text lists all commands and is kept in sync with
  the implementation.
- Running `gitello` with no arguments in a terminal launches the TUI (§6); when stdout is
  not a TTY it prints usage and exits 1.

## 4. Documentation

- `README.md` at the repo root: short project intro, an example of what the TUI board
  looks like (lists as columns, cards as lines, help bar), a link to `docs/tutorial.md`,
  and a note that the project is entirely vibe coded with Mistral Large 4, as an
  experiment to see how far a model can go.
- `docs/tutorial.md`: describes how to use the program, with examples. It must be kept in
  sync with the actual user interface and updated whenever the UI changes. It should
  describe the commands and the TUI, but must NOT describe the on-disk file layout
  (folders / `.json` files / `.gitkeep`); the fact that everything is stored in a git
  repo should only be mentioned briefly, in the section about the `gitello git` command.

## 5. Tests and verification

- `pnpm run check` must pass: Prettier `--check` clean, and all `node --test` tests pass.
- Cover, via temp-dir `GITELLO_PATH`: repo creation, list/card CRUD, auto-commits (verify
  with `git log` / `git status --porcelain` being clean after auto-commits), slug
  filenames and collision suffixes, the recency limit of 10 for bare `cards`, error cases
  (unknown list/card, duplicate list, unquoted titles), the git proxy exit-code
  pass-through, `show` output format (with/without `other` metadata, comments as string
  and as object), move (success, duplicate titles, filename collisions, all error
  cases), and the TUI pure-logic tests described below.
- Smoke-test the real CLI and the real TUI under a pty when possible.

## 6. TUI (run `gitello` with no arguments)

- Dependency choice: use **neo-blessed** — the actively maintained fork of blessed, very
  popular, with zero runtime dependencies of its own (everything is vendored). Import it
  as the maintained scoped package `@blessed/neo-blessed` (`^1.0.0`), and pass
  `extended: false` to `blessed.screen()`: modern terminfo entries contain an extended
  `Setulc` capability whose parameterized string makes neo-blessed's terminfo compiler
  emit invalid JS and print an `Error on <term>.Setulc:` dump on startup; `extended:
false` skips the extended section entirely, and gitello does not use extended
  capabilities, so nothing is lost.
- Structure: keep navigation/rendering logic pure and unit-testable without a TTY
  (`buildModel`, `initialState`, `applyKey`, `renderColumn` in `src/tui.js`); a separate
  `launch()` wires the pure logic to a neo-blessed screen. `bin/gitello.js` must handle
  the async `main()` for the TUI case.
- Board: every list is a column containing its cards. An empty repo shows a
  "No lists yet" hint.
  - `h`/`l` or left/right arrows: move between lists.
  - `j`/`k` or up/down arrows: move between cards in the current list (clamped at edges).
  - The selected card is highlighted with inverse video; the active list gets a cyan
    label/border.
  - `q`, `Esc`, or `Ctrl-C`: quit (exit code 0, no error output on close).
  - Help bar at the bottom listing the keys.
- Moving cards in the TUI: holding shift while pressing a horizontal movement key moves
  the currently selected card to the adjacent list (`S-h`/`S-l`/`S-left`/`S-right`;
  neo-blessed reports shift+key as `S-<key>`). `S-j`/`S-k`/`S-up`/`S-down` are no-ops — a
  card can only be moved between lists, never up/down within a list. The move persists
  immediately (file move + single git commit + model rebuild) and the board re-renders.
- Viewing a card in the TUI: `space` opens the currently selected card in a centered,
  scrollable modal box (with `tags: false` so card text is never parsed as blessed tags),
  labeled with the card title and containing the same formatted output as
  `gitello cards show <title>`. While the modal is open, navigation and move keys are
  ignored (quit keys still work).
- Editing a card in the TUI modal: the modal is an editable form with **Title**,
  **Description**, and **Comments** (one per line) fields; the `created:`/`modified:`
  timestamps and any other metadata stay read-only at the bottom of the modal.
  - `Tab` / `Shift-Tab`: cycle between the fields (wrapping around).
  - `Enter`: save and close the modal. Saving writes the card JSON (bumping `updatedAt`),
    rebuilds the board model, and commits to git with a message like
    `Update card "<title>" in list "<list>"`. An empty title is rejected: a hint
    ("title must not be empty") is shown in the help line and the modal stays open.
  - `Ctrl-Q`: close the modal and discard all modifications.
  - While the modal is open, `space` no longer closes it — printable keys type into the
    focused field. The modal keys (`tab`, `S-tab`, `enter`, `C-q`) plus the quit keys must
    be handled even while an input field has grabbed the keyboard (e.g. via the screen's
    `ignoreLocked` list), and the focused field's reading must be ended synchronously so
    the key itself is not inserted into the field.
  - Update the help line to include the new keys (e.g. `space: view card`, and the
    move/edit keys).

## 7. Suggested implementation order

1. Package scaffolding: `package.json`, `.nvmrc`, Prettier config, `bin/gitello.js`
   (prints a placeholder), CI workflow, `check`/`format` scripts, a passing dummy test.
2. Storage layer (`src/store.js`): repo init at `GITELLO_PATH`/`~/.gitello`, path-scoped
   auto-commit helper (single path or array of paths), `git` proxy.
3. Card model + commands (`src/cards.js`, `src/commands.js`, `src/cli.js`): lists and
   cards CRUD, `cards` recency listing, `show`, `move`, error handling, usage text.
4. Tests for everything above; `docs/tutorial.md` + `README.md` in sync.
5. TUI board (`src/tui.js` + `launch()`): model, navigation, rendering, quit keys; tests
   for the pure logic.
6. TUI card move (shift+horizontal keys), card view modal (space), card edit modal
   (tab/shift-tab/enter/ctrl-q); tests for the new pure helpers.
7. Final pass: `pnpm format`, `pnpm run check` green, pty smoke test of the TUI
   (renders, navigates, moves, views, edits, quits cleanly with no error output), README
   TUI example matching the real rendering.
