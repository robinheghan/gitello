# AGENTS.md — standing instructions for gitello

## Pull request workflow

- Every change to this repository must happen through a pull request. Never commit or push directly to `main`.
- Each PR description must include the prompt (the user request) that triggered the change, so the PR history shows why each change was made.

## Toolchain and package management

- Node.js v24 is required. It is pinned in three places: `engines.node` in `package.json`, `.nvmrc`, and the CI workflow (`.github/workflows/ci.yml` uses `actions/setup-node` with `node-version: 24`).
- pnpm is the package manager, pinned via the `packageManager` field in `package.json` (corepack). Run `corepack enable` once, then `pnpm install` to set up a new environment.
- Installing the package links the `gitello` binary (see `bin/gitello.js`) into `node_modules/.bin`; when installed globally it is added to `PATH`.
- `pnpm run ci` runs the full check: Prettier formatting verification (`prettier --check .`) followed by the test suite using Node's built-in test runner (`node --test`). Note: use `pnpm run ci`, because pnpm reserves the bare `ci` command name. The CI GitHub Action (`.github/workflows/ci.yml`) runs `pnpm run ci` on every PR creation and update.
- Format code before committing with `pnpm format` (`prettier --write .`); `pnpm format:check` is part of `pnpm run ci`.
