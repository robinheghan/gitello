import * as commands from "./commands.js";
import { CliError } from "./store.js";
import { launch } from "./tui.js";

const USAGE = `Usage:
  gitello                 open the interactive board (TUI)
  gitello lists
  gitello lists create <name>
  gitello lists remove <name>
  gitello cards
  gitello cards --all
  gitello cards <list>
  gitello cards <list> create <title>
  gitello cards <list> remove <title>
  gitello git <args...>
`;

export function main(argv, io = {}) {
  const streams = {
    stdout: io.stdout ?? process.stdout,
    stderr: io.stderr ?? process.stderr,
  };
  const stdin = io.stdin ?? process.stdin;
  try {
    if (argv.length === 0 && streams.stdout.isTTY && stdin.isTTY) {
      return launch({ stdin, stdout: streams.stdout, stderr: streams.stderr });
    }
    const [command, ...rest] = argv;
    switch (command) {
      case "lists":
        if (rest.length === 0) {
          commands.lists(streams);
          return 0;
        }
        if (rest[0] === "create" && rest.length === 2) {
          commands.createList(streams, rest[1]);
          return 0;
        }
        if (rest[0] === "remove" && rest.length === 2) {
          commands.removeList(streams, rest[1]);
          return 0;
        }
        break;
      case "cards":
        if (rest.length === 0) {
          commands.cards(streams, { all: false });
          return 0;
        }
        if (rest[0] === "--all" && rest.length === 1) {
          commands.cards(streams, { all: true });
          return 0;
        }
        if (rest[1] === "create" && rest.length === 3) {
          commands.createCardCommand(streams, rest[0], rest[2]);
          return 0;
        }
        if (rest[1] === "remove" && rest.length === 3) {
          commands.removeCard(streams, rest[0], rest[2]);
          return 0;
        }
        if (rest[1] === "create" || rest[1] === "remove") {
          throw new CliError(
            `"${rest[1]}" expects a single argument; quote multi-word values, e.g. "Title here"`,
          );
        }
        if (rest.length === 1) {
          commands.listCards(streams, rest[0]);
          return 0;
        }
        break;
      case "git":
        if (rest.length === 0) {
          throw new CliError("git requires arguments, e.g. gitello git status");
        }
        return commands.git(streams, rest);
    }
    streams.stderr.write(USAGE);
    return 1;
  } catch (error) {
    if (error instanceof CliError) {
      streams.stderr.write(`gitello: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
