# PLAN.md — gitello

Implement **gitello** from scratch in this folder: a text-driven Trello clone with git storage. It ships a Node.js CLI (`gitello`), an interactive TUI board, and its data stored in a git repo. Use Node.js built-in modules (`node:*`) wherever possible; the only external runtime dependency is the TUI library.

## 1. Toolchain and scaffolding

- Node.js **v22** (pin it in `.nvmrc` and in `package.json` under `engines.node` as `"22.x"`).
- **pnpm** as the package manager, pinned via the `packageManager` field in `package.json` (corepack). `pnpm install` sets up the environment.
- The package `gitello` exposes a `gitello` binary through the `bin` field: `bin/gitello.js`. When the package is installed (e.g. `pnpm link -g .`), `gitello` lands on `PATH`.
- Add a `check` script to `package.json`: `prettier --check . && node --test`. It must be invoked as `pnpm run check` (pnpm doesn't run scripts by bare name).
- Add Prettier config (`.prettierrc`, `.prettierignore`) so `prettier --check .` passes on all tracked files. Run `pnpm format` (i.e. `prettier --write .`) before finishing.
- Tests use Node's **built-in test runner** (`node --test`, files under `test/`).

## 2. Storage model

- Unless overridden by a `GITELLO_PATH` environment variable, gitello expects to find a git repo at `~/.gitello`.
- The first time the user inserts or reads from gitello, that repo is created if missing (plain `git init`, empty).
- Because commits must work even if the user has no global git identity, configure a repo-local `user.name`/`user.email` fallback when initializing the repo (or before committing when missing).
- **No automatic pull/push.** Instead, auto-commit after every mutation (list/card create/remove/move/edit), committing only the changed paths: `git add -- <path…>` then `git commit -m <message> -- <path…>`. A move (delete + add) is a single commit, so `store.commit()` takes a list of paths.
- Each **folder** in this repo represents a "list". Creating a list also writes a `.gitkeep` file in the folder so git stores it.
- Each **JSON file** in these folders represents a "card". A card contains: `title`, `description`, `comments` (array), `createdAt`, `updatedAt`.
- The card's filename is a **sanitized version of the title** (slug). If the sanitized filename already exists in the target list, append a numeric suffix: `-2`, `-3`, … (shared `uniqueFileName` helper used by create and move).
- Multi-word titles must be passed **quoted** (a single argument); the CLI validates argument counts and tells the user to quote multi-word values.
- Commit messages: human-readable, e.g. `Add list "..."`, `Add card "..." to list "..."`, `Remove card ...`, `Move card "..." from list "..." to list "..."`, `Update card "..." in list "..."`.

## 3. CLI commands

Structure: thin `bin/gitello.js` → `src/cli.js` (argument parsing) → `src/commands.js`; `src/store.js` (git/repo operations); `src/cards.js` (card model); `src/tui.js` (TUI).

All commands:

- `gitello` (no arguments): in a TTY, launch the TUI board (section 5). Without a TTY, print usage and exit 1. `bin/gitello.js` must handle `main()` returning a Promise.
- `gitello lists` — print the name of each list on separate lines.
- `gitello lists create <name>` — create a new list (`.gitkeep` inside, auto-commit).
- `gitello lists remove <name>` — remove a list, auto-commit.
- `gitello cards` — print the titles of the **ten most recently created/modified** cards (most recent first, by `updatedAt`).
- `gitello cards --all` — print the titles of all existing cards.
- `gitello cards <list>` — print the title of every card within the specified list, in creation order.
- `gitello cards <list> create <title>` — create a new card with the given title (empty description, empty comments) in the given list, auto-commit.
- `gitello cards <list> remove <title>` — remove matching card(s), auto-commit.
- `gitello cards <from_list> move <title> <to_list>` — move **every card matching the title** from one list to another; print one `Moved card ...` line per card; a single git commit for the whole move. Validate both lists; reject missing cards, same-list moves, and wrong argument counts. When the target list already has the same filename, pick a fresh one (`-2`, `-3`, …).
- `gitello cards show <title>` — print the contents of every card with that title, searched across all lists, most recent first. Output format (per card, via a `formatCard` helper):

  ```
  <title>

  <description>

  created: <created_timestamp>
  modified: <modified_timestamp>
  other: {"key":value,...}        ← only when extra metadata beyond the
                                     known fields exists

  ...comments...                  ← one per line; string comments as-is,
                                     object comments as JSON
  ```

  Unknown titles fail with `card not found: <title>`.
- `gitello git <args...>` — proxy for running git commands **in the gitello repo** (pull/push/manual fixes); pass through the exit code.

Errors (unknown list/card, duplicate list, invalid names, unquoted titles, wrong argument counts) go to **stderr** with exit code 1; unknown commands print usage.

## 4. Card model helpers (`src/cards.js`)

- `sanitize`/slug for titles, `uniqueFileName` (collision suffixes), `moveCardFile`.
- `formatCard`, `formatComments` (each comment rendered on one line, strings as-is, objects as JSON), `formatMeta` (the `created:`/`modified:`/optional `other:` lines; the known-field set is `title`, `description`, `comments`, `createdAt`, `updatedAt`).
- `parseComments` (turn textarea lines back into a comments array; a line that parses as JSON becomes an object, otherwise a string).
- `updateCard` — write the card JSON, bumping `updatedAt`, keeping `createdAt` and any other metadata.

## 5. TUI board

Use **`@blessed/neo-blessed`** (the maintained scoped package, `^1.0.0`) as the TUI dependency. When creating the screen, pass `extended: false` — this skips the terminfo *extended* section (whose `Setulc` capability makes neo-blessed's terminfo compiler emit invalid JS and print `Error on xterm-256color.Setulc:` on startup/exit). gitello doesn't use extended capabilities, so nothing is lost. This is **not** the unscoped `neo-blessed` package, which is capped at 0.2.0 on npm.

### Board

- Visualizes every list as a column and the cards within it as lines.
- `h`/`l` or left/right arrows move between lists; `j`/`k` or up/down arrows move between cards in the current list (clamped at edges).
- The currently selected card is highlighted with inverse video; the active list gets a cyan label/border.
- An empty board shows a "No lists yet" hint.
- `q`, `Esc`, or `Ctrl-C` quits (exit code 0).
- A help bar/line listing the keys; keep it in sync as features are added.

### Moving cards in the TUI

- Holding **shift** moves the currently selected card in the movement direction: `shift+h`/`shift+l`/`shift+left`/`shift+right` move it between lists (neo-blessed reports shift-modified keys as `S-h`, `S-l`, `S-left`, `S-right`). The move is persisted (file move + one commit + model rebuild) and the board re-renders.
- Shift + vertical keys (`S-j`/`S-k`/`S-up`/`S-down`) are no-ops: cards can be moved between lists, not up or down within a list.

### Card modal (view and edit)

- **Space** opens the currently selected card in a centered modal: cyan border, scrollable, and `tags: false` so card text is never parsed as blessed tags.
- The modal has three editable fields: **Title** (single-line textbox), **Description** (multiline textarea), and **Comments** (multiline textarea, one comment per line). The `created:`/`modified:` timestamps (and any `other:` metadata) render read-only at the bottom of the modal.
- **Tab** / **Shift-Tab** cycle focus between the fields (wrapping around). All other keys type into the focused field (so space does not close the modal once it is open).
- **Enter** saves and closes the modal: write the card JSON (bumping `updatedAt`), rebuild the board model, and commit with `Update card "..." in list "..."`.
- **Ctrl-Q** closes the modal and discards the modifications.
- An empty title is rejected: show a hint in the help line (e.g. "title must not be empty") and keep the modal open without saving.
- Validate card JSON defensively when reading (wrap `JSON.parse` in try/catch).

### Implementation shape (testability without a TTY)

- `src/tui.js` keeps navigation/rendering logic pure and exported: `buildModel`, `initialState`, `applyKey` (returns descriptors like navigation steps, `move`, `toggleCard`, `quit`), `renderColumn`; plus pure `applyModalKey(key, focus, fieldCount)` for modal navigation.
- `launch()` wires the model to a neo-blessed screen; `performMove` and `performUpdate(repo, model, state, values)` do the persistence and model rebuild.
- The screen's `ignoreLocked` list must include the modal keys (`tab`, `S-tab`, `enter`, `C-q`) and quit keys so they are handled even while an input field has keyboard focus; the focused field's reading must be ended synchronously so the modal-handling key itself is not inserted into the field.

## 6. GitHub Actions

- `.github/workflows/ci.yml`: runs `pnpm run check` on every PR opened/synchronize/reopened, using Node 22 (`actions/setup-node` with `node-version: 22`) and pnpm from the `packageManager` field.
- `.github/workflows/review.yml`: runs on `pull_request: opened` with `permissions: contents: read, pull-requests: write`, calling `scripts/ai-review.mjs`. That script fetches the PR title, description, and diff via `gh`, sends them to the Mistral chat completions API using Node's built-in `fetch`, and posts the generated review as a PR comment (heading `## AI review`). Model and endpoint configurable via `REVIEW_MODEL` / `REVIEW_ENDPOINT` (defaults: `mistral-large-latest` at `https://api.mistral.ai/v1/chat/completions`); the API key comes from a `MISTRAL_API_KEY` secret/repo env var; diffs are truncated at 120k characters. Guard missing env vars and API/CLI errors gracefully.

## 7. Documentation

- `README.md`: describes the project ("a text-driven Trello clone with git storage"), shows a **TUI example** (a code block rendering lists as columns with cards and a help bar, matching the real board layout), links to the tutorial, and states that the project is entirely vibe coded (an experiment with Mistral large models: originally Mistral Large 4).
- `docs/tutorial.md`: the user guide, with examples for every command and TUI feature, kept in sync with the actual user interface. **It must not describe the on-disk file layout** (folders/JSON files/`.gitkeep`); the fact that everything is stored in a git repo is mentioned only briefly, in the `gitello git` section.
- Update the usage text and help line(s) whenever a command or key changes.

## 8. Tests

Using `node --test`, run against a temp directory via `GITELLO_PATH` (never the real home repo). Cover:

- Repo auto-creation on first use; repo-local identity fallback.
- List create/remove/listing; `.gitkeep` in created lists.
- Card create/remove/move/show: slug filenames, collision suffixes, recency limit (`cards` = 10 most recent by `updatedAt`, most recent first), per-list creation order, cross-list lookup, moving every duplicate title in one commit, filename collisions on move.
- Auto-commits: each mutation produces its own commit with the right message; `gitello git` proxy passes exit codes through.
- Error cases: unknown list/card, duplicate list, invalid names, unquoted multi-word titles, wrong argument counts, same-list move, empty title on save.
- `formatCard`/`formatMeta`/`formatComments`/`parseComments` edge cases (missing fields, string vs object comments, extra metadata present/absent).
- TUI pure functions: `applyKey` hjkl/arrow navigation, clamping, empty boards, quit keys, shift-move descriptors and no-op vertical shifts; `applyModalKey` tab/S-tab wrap-around, enter/C-q/space behavior; `performMove` and `performUpdate` persistence + commit (use a synthetic repo fixture).

## 9. Suggested build order

1. Scaffold: `package.json` (pins, bin, check script), Prettier config, dummy passing test, `.nvmrc`, CI workflow.
2. `src/store.js` (repo location/init/identity, commit, git proxy) + `src/cards.js` basics.
3. CLI: `lists` subcommands, `cards` subcommands (create/remove, listing variants, move, show).
4. TUI dependency + board (navigation, highlight, help, quit).
5. Shift-moves, card modal (view), modal editing (fields, tab cycle, enter save, ctrl+q discard).
6. `scripts/ai-review.mjs` + review workflow.
7. README + tutorial, usage text, help lines.
8. `pnpm format`, then `pnpm run check` until Prettier is clean and all tests pass.

The final check for the whole deliverable: `pnpm install`, `pnpm run check` (Prettier `--check` + full `node --test` suite) must pass, and a manual smoke test with a temp `GITELLO_PATH` should exercise every CLI command, the `gitello git` proxy, and the TUI (board, navigation, shift-move, modal view/edit).
