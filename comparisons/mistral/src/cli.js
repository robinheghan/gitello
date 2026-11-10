import { CommandError, runCommand } from './commands.js';

export const USAGE = `gitello — a small kanban-style tool: lists containing cards,
stored in a dedicated git repository.

Usage:
  gitello lists                            Print all lists, one per line
  gitello lists create <name>              Create a new list
  gitello lists remove <name>              Remove a list
  gitello cards                            Print the 10 most recently updated cards
  gitello cards --all                      Print all cards
  gitello cards <list>                     Print the cards of a list (creation order)
  gitello cards <list> create <title>      Create a card in a list
  gitello cards <list> remove <title>      Remove card(s) with that title from a list
  gitello cards <from> move <title> <to>   Move card(s) from one list to another
  gitello cards show <title>               Show card(s) with that title (all lists)
  gitello git <args...>                    Run a git command inside the data repo

Multi-word names and titles must be passed as a single quoted argument,
e.g. gitello cards "My List" create "My card title".

Run \`gitello\` with no arguments in a terminal to open the interactive board (TUI).
Data is stored in a git repo at ~/.gitello (override with the GITELLO_PATH
environment variable); use \`gitello git <args...>\` to pull/push or fix things
manually.`;

/**
 * CLI entry point. Returns the process exit code.
 * With no arguments in a TTY it launches the interactive TUI.
 */
export async function main(argv) {
  if (argv.length === 0) {
    if (process.stdout.isTTY) {
      const { launch } = await import('./tui.js');
      launch();
      return 0;
    }
    process.stderr.write(USAGE + '\n');
    return 1;
  }
  try {
    return runCommand(argv);
  } catch (err) {
    if (err instanceof CommandError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.showUsage) process.stderr.write(USAGE + '\n');
      return 1;
    }
    throw err;
  }
}
