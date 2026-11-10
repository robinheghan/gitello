# gitello

A small kanban-style tool: **lists** containing **cards**, stored in a dedicated git
repository, driven by a CLI and an interactive terminal UI (TUI).

Run `gitello` in a terminal to open the board — every list is a column, every card a
line, with a help bar at the bottom:

```
┌─ Done ────────────────┐┌─ Todo ────────────────┐
│ Done task             ││ > First task          │
│                       ││   Second task         │
│                       ││                       │
└───────────────────────┘└───────────────────────┘
h/l or ←/→: list · j/k or ↑/↓: card · S-h/S-l: move card to list · space: view/edit card · q: quit
```

(The selected card is highlighted with inverse video; the active list's label and
border are cyan.)

The same data is available from the command line:

```console
$ gitello lists create "Todo"
$ gitello cards "Todo" create "First task"
$ gitello cards                 # 10 most recently updated cards
$ gitello cards show "First task"
```

See [docs/tutorial.md](docs/tutorial.md) for the full tutorial: all commands and the
interactive keys.

Every change is auto-committed to the data repo (`~/.gitello`, override with the
`GITELLO_PATH` environment variable), so the full history of your board is always
available via `gitello git log`. Use `gitello git pull` / `gitello git push` to sync.

## Development

- Node.js v22 and pnpm (see `.nvmrc` / `packageManager` in `package.json`).
- `pnpm install`, then `pnpm run check` (Prettier + `node --test`).
- `pnpm format` before committing.

---

This project is entirely vibe coded with Mistral Large 4, as an experiment to see how
far a model can go.
