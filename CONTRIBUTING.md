# Contributing to gitello

gitello is a text-driven Trello clone with git storage, used through the command line and/or a TUI.

## Feature requests

Submit a feature request by [opening a GitHub issue](https://github.com/robinheghan/gitello/issues/new/choose) with the **Feature request** template (`.github/ISSUE_TEMPLATE/feature_request.md`). The intake workflow (`.github/workflows/feature-request-intake.yml`) labels it `feature-request` and acknowledges it.

## Implementation (agent workflow)

A Mistral agent picks up `feature-request` issues and implements them:

1. Read the issue and its acceptance criteria.
2. Create a branch: `git checkout -b vibe/issue-<number>-<slug>`.
3. Implement the feature in focused commits and push the branch.
4. Open a PR from that branch using the PR template (`.github/PULL_REQUEST_TEMPLATE.md`) with `Closes #<number>` in the body.

## Review

Every PR triggers `.github/workflows/pr-review.yml`, which checks that the PR links its issue and runs build/lint/tests, posting the result as a PR review. On top of that, an agent reviews the code changes and requests changes or approves before the PR merges.
