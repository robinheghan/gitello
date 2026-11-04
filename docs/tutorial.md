# Tutorial

gitello stores all of its data in a git repository. By default it uses `~/.gitello`; set the `GITELLO_PATH` environment variable to use a different location:

```sh
export GITELLO_PATH=~/my-gitello
```

The first time you run any gitello command, the repository is created if it does not exist yet. The repository starts out empty.

## Lists

Each folder in the repository is a list.

```sh
$ gitello lists
$ gitello lists create todo
Created list "todo"
$ gitello lists
todo
$ gitello lists remove todo
Removed list "todo"
```

Creating a list adds a `.gitkeep` file to the folder so that the empty folder can be stored in git.

## Cards

Each `.json` file inside a list folder is a card. A card contains a `title`, a `description`, a `comments` array, and `createdAt`/`updatedAt` timestamps. The file name is a sanitized version of the title.

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

Every list and card creation or removal is committed automatically. To run git commands inside the gitello repository — for example to sync it with a remote or to fix a merge conflict — use the `git` command:

```sh
$ gitello git remote add origin git@example.com:gitello.git
$ gitello git push
$ gitello git pull
$ gitello git log --oneline
```
