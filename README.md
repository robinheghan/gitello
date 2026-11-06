# gitello

A text-driven trello clone with git storage

This project is entirely vibe coded: every line of it was written by [Mistral Large 4](https://mistral.ai), as an experiment to see how far a model can go on its own.

## The board

Run `gitello` with no arguments to open an interactive board. Each list is a column, and each card in the list is a line in that column:

```sh
$ gitello lists create todo
$ gitello lists create in-progress
$ gitello lists create done
$ gitello cards todo create "Fix the login bug"
$ gitello cards todo create "Write the README"
$ gitello cards in-progress create "Design the board view"
$ gitello cards done create "Set up the project"
$ gitello
```

```
┌ todo ──────────────────┐┌ in-progress ───────────┐┌ done ────────────────────┐
│ Fix the login bug      ││ Design the board view  ││ Set up the project       │
│ Write the README       ││                        ││                          │
│                        ││                        ││                          │
└────────────────────────┘└────────────────────────┘└──────────────────────────┘
h/l or ←/→: lists · j/k or ↑/↓: cards · shift+h/l or shift+←/→: move card · space: view card · q/esc: quit
```

The active list has a cyan border and title, and the selected card is highlighted with inverse video. Move between lists with `h`/`l` or the left/right arrow keys, move between cards with `j`/`k` or the up/down arrow keys, and quit with `q`, `Esc`, or `Ctrl-C`. Hold `Shift` while pressing `h`/`l` or the left/right arrow keys to move the selected card to the adjacent list; cards can only be moved between lists, not up or down within a list. Press `space` to open the selected card in a modal showing its description, created/modified timestamps, any other metadata, and comments; press `space` again to close the modal.

The same data is also available from the command line — `gitello lists` and `gitello cards` list and manage lists and cards without opening the board.

See the [tutorial](docs/tutorial.md) for how to use gitello, with examples.
