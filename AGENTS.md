# AGENTS.md — how agents work on gitello

## Project

A text-driven Trello clone with git storage, driven from the CLI and/or a TUI.

## Workflow

1. **Feature requests** arrive as GitHub issues created from the *Feature request* template and labeled `feature-request` (see `.github/workflows/feature-request-intake.yml`).
2. **Implementation**: pick up a `feature-request` issue, create branch `vibe/issue-<number>-<slug>`, implement it in focused commits, push, and open a PR from that branch using `.github/PULL_REQUEST_TEMPLATE.md` with `Closes #<number>` in the PR body.
3. **Review**: every PR runs `.github/workflows/pr-review.yml` (linked-issue check + build/lint/tests, posted as a review). Then an agent reviews the code itself — check correctness, scope, style, and tests — and requests changes or approves. Address review comments with follow-up commits on the same branch.

Full details in `CONTRIBUTING.md`.
