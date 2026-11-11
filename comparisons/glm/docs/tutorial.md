# gitello tutorial

gitello is a text-driven Trello clone: your board is a set of **lists**,
each containing **cards**. You can work from the shell or from the
interactive board.

If you just want to explore, point gitello at a scratch directory first:

```console
$ GITELLO_PATH=/tmp/my-board gitello lists create todo
```

Without `GITELLO_PATH`, gitello uses `~/.gitello`, creating it on first use.

## Lists

`gitello lists` prints the name of every list, one per line:

```console
$ gitello lists
todo
done
```

Create a list:

```console
$ gitello lists create "reading list"
```

Remove one (remove its cards with it):

```console
$ gitello lists remove "reading list"
```

Multi-word names must be passed as a single quoted argument — `gitello
lists create reading list` is rejected with a hint, because gitello cannot
tell where one name ends and the next argument starts.

## Cards

Each card has a title, a description, and comments.

### Creating cards

```console
$ gitello cards todo create "fix the bug"
```

### Which cards does gitello show?

- `gitello cards` prints the titles of the ten most recently created or
  modified cards, most recent first.
- `gitello cards --all` prints the titles of all cards.
- `gitello cards todo` prints every card in `todo`, oldest first:

```console
$ gitello cards todo
fix the bug
write docs
```

### Looking at a card

`gitello cards show` prints every card with that title, wherever it lives,
most recent first:

```console
$ gitello cards show "fix the bug"
fix the bug

It crashes on start

created: 2025-01-01T10:00:00.000Z
modified: 2025-01-02T10:00:00.000Z

note from review
```

An unknown title fails with `card not found: <title>`.

### Moving cards

Move every card with the given title to another list (one git commit for
the whole move, one `Moved card ...` line per card):

```console
$ gitello cards todo move "fix the bug" done
Moved card "fix the bug" from list "todo" to list "done"
```

Both lists must exist, the target must differ from the source, and at
least one matching card must be found. When the target already holds a
card with the same title, the moved card is given a fresh distinctive
name automatically.

### Removing cards

```console
$ gitello cards todo remove "fix the bug"
```

This removes **every** card in `todo` with that exact title.

## git, pull and push

gitello commits after every change, and never pulls or pushes on its own.
To synchronize or inspect history, use the `git` proxy, which runs git
inside your board's repository and passes the exit code through:

```console
$ gitello git remote add origin git@example.com:me/my-board.git
$ gitello git push -u origin main
$ gitello git pull
$ gitello git log --oneline
```

## The interactive board

Run `gitello` with no arguments inside a terminal to open the board.
Every list is a column; every card is a line in it.

- `h` / `l` or left/right arrows move between lists.
- `j` / `k` or up/down arrows move between cards (clamped at the edges).
- The selected card is highlighted in inverse video and the active list
  is shown with a cyan name and border.
- An empty board shows a `No lists yet` hint.
- `q`, `Esc`, or `Ctrl-C` quits.

A help line at the bottom keeps the keys in view:

```
h/l: list  j/k: card  shift+h/l: move card  space: edit card  q: quit
```

### Moving cards on the board

Hold shift while moving to carry the selected card with you:

- `shift+h` / `shift+l` (or `shift+left` / `shift+right`) moves the card
  to the previous or next list. The card keeps its position in history;
  the board reloads and selects the moved card.
- Shift plus the vertical keys does nothing: cards move between lists,
  not up and down within a list.

### The card editor

Press `space` with a card selected to open it in a centered modal with a
cyan border:

- **Title** — a single-line field.
- **Description** — a multiline field.
- **Comments** — a multiline field, one comment per line. A line that
  looks like JSON (`{"author":"rob","text":"ok"}`) is stored as an
  object; every other line becomes a plain string comment.
- `created:` and `modified:` (plus any extra metadata) are shown
  read-only at the bottom of the modal.

While the modal is open:

- `Tab` / `Shift-Tab` cycles focus between the three fields, wrapping
  around. Everything you type goes into the focused field — space, for
  example, is typed, it does not close the modal.
- `Enter` saves and closes; `Ctrl-Q` closes and discards your changes.
- An empty title is refused — the help line shows `title must not be
empty` and the modal stays open.

## Where to go from here

- Use `gitello cards show` and `gitello git log` to review what you did.
- Point `GITELLO_PATH` at a directory inside your own git remotes to
  sync boards between machines via `gitello git pull` / `push`.
