# gitello

A text-driven Trello clone with git storage.

gitello keeps kanban-style boards — lists containing cards — in a dedicated
git repository, so every change you make is a commit you can inspect, pull
and push. It ships a small CLI for scripting and an interactive terminal
board you can drive entirely from the keyboard:

```
 ┌ todo ─────────────┐  ┌ done ───────────────┐
 │>fix the bug       │  │ ship release        │
 │ write docs        │  └─────────────────────┘
 │ plan release      │
 └───────────────────┘
h/l: list  j/k: card  shift+h/l: move card  space: edit card  q: quit
```

(The `>` marks the card currently highlighted in inverse video; the active
list's name and border are shown in cyan.)

## Usage

Run `gitello` inside a terminal to open the board (use `h/l`, `j/k`,
`shift+h/l`, and `space` against the highlighted card), or use the CLI:

```console
$ gitello lists
todo
done

$ gitello lists create "reading list"

$ gitello cards todo create "fix the bug"

$ gitello cards show "fix the bug"

$ gitello cards todo move "fix the bug" done
Moved card "fix the bug" from list "todo" to list "done"
```

See [docs/tutorial.md](docs/tutorial.md) for a walkthrough of every command
and board feature.

## Install

gitello requires Node.js 22 and uses pnpm:

```console
$ pnpm install
$ pnpm link -g .   # puts `gitello` on your PATH
```

To try it safely, point `GITELLO_PATH` at an empty directory:

```console
$ GITELLO_PATH=/tmp/my-board gitello
```

## Development

```console
$ pnpm run check   # prettier --check . && node --test
```

This project is entirely vibe coded — an experiment in building real tools
with Mistral large models (originally Mistral Large 4).
