# Tutorial

By default gitello keeps its data in `~/.gitello`; set the `GITELLO_PATH` environment variable to use a different location:

```sh
export GITELLO_PATH=~/my-gitello
```

The first time you run any gitello command, the data store is created if it does not exist yet. It starts out empty.

## Lists

gitello organizes cards into lists.

```sh
$ gitello lists
$ gitello lists create todo
Created list "todo"
$ gitello lists
todo
$ gitello lists remove todo
Removed list "todo"
```

## Cards

A card has a `title`, a `description`, a `comments` array, and `createdAt`/`updatedAt` timestamps.

```sh
$ gitello cards todo create "Fix the login bug"
Created card "Fix the login bug" in list "todo"
$ gitello cards todo
Fix the login bug
$ gitello cards
Fix the login bug
$ gitello cards --all
Fix the login bug
$ gitello cards todo remove "Fix the login bug"
Removed card "Fix the login bug" from list "todo"
```

- `gitello cards` prints the titles of the ten most recently created/modified cards across all lists, most recent first.
- `gitello cards --all` prints the titles of all cards.
- `gitello cards <list>` prints the title of every card in the given list.
- `gitello cards <list> create <title>` creates a card in the given list. Multi-word titles must be quoted: `gitello cards todo create "Fix the login bug"`.
- `gitello cards <list> remove <title>` removes the card(s) with the given title from the list.

## The board (TUI)

Running `gitello` with no arguments opens an interactive board when stdin and stdout are a terminal:

```sh
$ gitello
```

Each list is shown as a column containing its cards. Move between lists with `h`/`l` or the left/right arrow keys, and between the cards of the current list with `j`/`k` or the up/down arrow keys. The selected card is highlighted. Press `q`, `Esc`, or `Ctrl-C` to quit.

When the output is not a terminal (for example when piping), running `gitello` without arguments prints the usage instead.

## Git

Everything is stored in a git repository, and every list and card creation or removal is committed automatically. To run git commands against that repository — for example to sync it with a remote or to fix a merge conflict — use the `git` command:

```sh
$ gitello git remote add origin git@example.com:gitello.git
$ gitello git push
$ gitello git pull
$ gitello git log --oneline
```
