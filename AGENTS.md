# AGENTS.md — standing instructions for gitello

## Pull request workflow

- Every change to this repository must happen through a pull request. Never commit or push directly to `main`.
- Pull requests must be opened ready for review, never as drafts.
- Each PR description must include the prompt (the user request) that triggered the change, so the PR history shows why each change was made.
- When a new prompt causes changes to an existing PR, add that prompt as a comment on the PR.
- Always monitor CI on every PR you open: after opening a PR (and after every push of fixes to it), poll `gh pr checks <number>` until the `ci` and `review` workflows finish and the PR carries the `ai-reviewed` label (the `review` workflow adds it only after both the Mistral and the GLM 5.3 reviews are posted). Only then read the two `## AI review (<model>)` comments posted by `github-actions[bot]`, and if CI fails or either review flags issues, push fixes to the same PR branch and repeat until all checks pass.

## Toolchain and package management

- Node.js v22 is required. It is pinned in three places: `engines.node` in `package.json`, `.nvmrc`, and the CI workflow (`.github/workflows/ci.yml` uses `actions/setup-node` with `node-version: 22`).
- pnpm is the package manager, pinned via the `packageManager` field in `package.json` (corepack). Run `corepack enable` once, then `pnpm install` to set up a new environment.
- Installing the package links the `gitello` binary (see `bin/gitello.js`) into `node_modules/.bin`; when installed globally it is added to `PATH`.
- `pnpm run check` runs the full check: Prettier formatting verification (`prettier --check .`) followed by the test suite using Node's built-in test runner (`node --test`). The script is named `check` and must be invoked as `pnpm run check` (pnpm does not run package scripts via the bare name). The CI GitHub Action (`.github/workflows/ci.yml`) runs `pnpm run check` on every PR creation and update.
- Format code before committing with `pnpm format` (`prettier --write .`); `pnpm format:check` is part of `pnpm run check`.

## Dependencies

- Prefer Node.js built-in APIs (`node:*` modules) over external dependencies, unless using a built-in would require a lot of extra code.

## Documentation

- `docs/tutorial.md` describes how to use the program, with examples. It is referenced from `README.md`.
- Update `docs/tutorial.md` whenever the user interface changes, so it stays in sync with the actual user interface.
