# gitello tutorial

`gitello` is a small kanban-style tool: **lists** that contain **cards**. You can use it
from the command line, or open the interactive board (TUI) by running `gitello` with no
arguments in a terminal.

All data lives in a git repo at `~/.gitello` (override with the `GITELLO_PATH`
environment variable). Every change you make is committed automatically, one commit per
change — more on that in the [`gitello git`](#gitello-git-args) section below.

> Multi-word names and titles must be passed as a **single quoted argument**:
> `gitello cards "My List" create "My card title"`. Forgetting the quotes gives an
> error reminding you to quote multi-word values.

## Managing lists

```console
$ gitello lists                     # print every list, one per line
$ gitello lists create "Todo"       # create a new list
$ gitello lists remove "Todo"       # remove a list (and its cards)
```

## Managing cards

```console
$ gitello cards "Todo" create "First task"   # create a card in a list
$ gitello cards "Todo"                      # print the cards of a list (creation order)
$ gitello cards                             # print the 10 most recently updated cards
$ gitello cards --all                       # print all cards
$ gitello cards "Todo" remove "First task"  # remove card(s) with that title
$ gitello cards show "First task"           # show card details (searches all lists)
```

`cards show` prints the title, description, timestamps, any extra metadata, and the
comments (one per line):

```
First task

Write the tutorial

created: 2026-11-10T19:44:27.396Z
modified: 2026-11-10T20:01:03.112Z

looks good to me
```

Moving cards between lists (one `Moved card ...` line per moved card):

```console
$ gitello cards "Todo" move "First task" "Done"
Moved card "First task" from "Todo" to "Done"
```

## The interactive board (TUI)

Run `gitello` with no arguments in a terminal:

```
┌─ Done ────────────────┐┌─ Todo ────────────────┐
│ Done task             ││ > First task          │
│                       ││   Second task         │
└───────────────────────┘└───────────────────────┘
h/l or ←/→: list · j/k or ↑/↓: card · S-h/S-l: move card to list · space: view/edit card · q: quit
```

- Every list is a column; every card is a line in its list's column. The selected card
  is highlighted (inverse video) and the active list gets a cyan label and border. An
  empty board shows a "No lists yet" hint.
- `h`/`l` or `←`/`→` move between lists; `j`/`k` or `↑`/`↓` move between cards (clamped
  at the edges).
- Hold **shift** while pressing a horizontal key (`S-h`/`S-l`/`S-left`/`S-right`) to move
  the selected card to the adjacent list. The move is saved immediately. (`S-j`/`S-k`/
  `S-up`/`S-down` do nothing — cards only move between lists, never up/down within one.)
- `space` opens the selected card in a modal: an editable form with **Title**,
  **Description**, and **Comments** (one per line) fields; the `created:`/`modified:`
  timestamps and any other metadata stay read-only at the bottom of the modal.
  - `Tab` / `Shift-Tab`: cycle between the fields (wrapping around).
  - `Enter`: save and close the modal (the change is committed immediately). An empty
    title is rejected — a hint is shown in the help line and the modal stays open.
  - `Ctrl-Q`: close the modal and discard all modifications.
  - While the modal is open, navigation and move keys are ignored and printable keys
    type into the focused field; `space` no longer closes the modal.
- `q`, `Esc`, or `Ctrl-C` quit (the quit keys work even while the modal is open).

## `gitello git <args...>`

`gitello` stores everything in a git repository (at `~/.gitello` unless `GITELLO_PATH`
says otherwise) and auto-commits every change. The `git` subcommand runs any git
command inside that repo — handy for pull/push or manual fixes — and passes through the
exit code:

```console
$ gitello git log --oneline
$ gitello git status
$ gitello git pull
$ gitello git push
```

## Errors

Unknown lists/cards, duplicate lists, invalid names, unquoted multi-word values, and
wrong argument counts all print an error to stderr and exit with code 1. Unknown
commands print the usage text, which lists all commands:

```console
$ gitello
Usage:
  gitello lists                            Print all lists, one per line
  ...
```
