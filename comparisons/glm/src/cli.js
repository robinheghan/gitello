import * as cards from './cards.js';
import * as commands from './commands.js';
import { CommandError } from './commands.js';
import * as store from './store.js';
import * as tui from './tui.js';

export const USAGE = `gitello - a text-driven trello clone with git storage

usage:
  gitello                               interactive board (requires a TTY)
  gitello lists                         print all lists
  gitello lists create <name>           create a list
  gitello lists remove <name>           remove a list
  gitello cards                         print the 10 most recently modified cards
  gitello cards --all                   print all cards
  gitello cards <list>                  print all cards in a list (creation order)
  gitello cards <list> create <title>   create a card in a list
  gitello cards <list> remove <title>   remove every card with that title from a list
  gitello cards <from> move <title> <to>
                                         move every matching card to another list
  gitello cards show <title>            print every card with that title
  gitello git <args...>                 run git in the gitello repository

Always pass multi-word names and titles as a single quoted argument.`;

export function defaultIo() {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    tty: Boolean(process.stdout.isTTY && process.stdin.isTTY),
    gitStdio: 'inherit',
  };
}

const quoteHint = 'pass multi-word values as a single quoted argument';

function expectArgs(argv, count, worker) {
  if (argv.length < count) {
    throw new CommandError(`missing argument (${quoteHint})`);
  }
  if (argv.length > count) {
    throw new CommandError(
      `unexpected argument: "${argv[count]}" (${quoteHint})`,
    );
  }
  return worker();
}

function printLines(io, lines) {
  if (lines.length > 0) {
    io.stdout.write(lines.join('\n') + '\n');
  }
}

async function runCommand(argv, repo, io) {
  const [head, ...rest] = argv;

  if (head === undefined) {
    if (io.tty) {
      return tui.launch({ repo });
    }
    io.stderr.write(USAGE + '\n');
    return 1;
  }

  if (head === 'lists' && rest[0] !== 'create' && rest[0] !== 'remove') {
    expectArgs(rest, 0, () => printLines(io, commands.listNames(repo)));
    return 0;
  }

  if (head === 'lists') {
    const [sub, ...args] = rest;
    if (sub === 'create') {
      expectArgs(args, 1, () => commands.createList(repo, args[0]));
    } else {
      expectArgs(args, 1, () => commands.removeList(repo, args[0]));
    }
    return 0;
  }

  if (head === 'cards') {
    return runCards(rest, repo, io);
  }

  if (head === 'git') {
    if (rest.length === 0) {
      throw new CommandError('missing git command');
    }
    return store.gitProxy(rest, { repo, stdio: io.gitStdio ?? 'inherit' });
  }

  io.stderr.write(`unknown command: ${head}\n` + USAGE + '\n');
  return 1;
}

function runCards(rest, repo, io) {
  if (rest.length === 0) {
    const recentCards = commands.recentCards(repo);
    printLines(
      io,
      recentCards.map((entry) => entry.card.title),
    );
    return 0;
  }

  const [name, sub, ...args] = rest;

  if (name === '--all') {
    expectArgs(rest, 1, () => {
      const lines = [];
      for (const list of commands.listNames(repo)) {
        for (const entry of commands.cardsInList(repo, list)) {
          lines.push(entry.card.title);
        }
      }
      printLines(io, lines);
    });
    return 0;
  }

  if (name === 'show') {
    expectArgs(rest, 2, () => {
      const found = commands.findCards(repo, rest[1]);
      if (found.length === 0) {
        throw new CommandError(`card not found: ${rest[1]}`);
      }
      io.stdout.write(
        `${found.map((entry) => cards.formatCard(entry.card)).join('\n\n')}\n`,
      );
    });
    return 0;
  }

  if (sub === undefined) {
    expectArgs(rest, 1, () => {
      if (!commands.listNames(repo).includes(name)) {
        throw new CommandError(`list not found: ${name}`);
      }
      printLines(
        io,
        commands.cardsInList(repo, name).map((entry) => entry.card.title),
      );
    });
    return 0;
  }

  if (sub === 'create' || sub === 'remove') {
    expectArgs(rest, 3, () => {
      if (sub === 'create') {
        commands.createCard(repo, name, args[0]);
      } else {
        commands.removeCards(repo, name, args[0]);
      }
    });
    return 0;
  }

  if (sub === 'move') {
    expectArgs(rest, 4, () => {
      const [title, to] = args;
      const moved = commands.moveCards(repo, name, title, to);
      for (const entry of moved) {
        io.stdout.write(
          `Moved card "${entry.card.title}" from list "${name}" to list "${to}"\n`,
        );
      }
    });
    return 0;
  }

  io.stderr.write(`unknown command: cards ${sub}\n` + USAGE + '\n');
  return 1;
}

export async function main(argv, io = defaultIo()) {
  const repo = store.ensureRepo(store.repoPath());
  try {
    return await runCommand(argv, repo, io);
  } catch (err) {
    if (err instanceof CommandError) {
      io.stderr.write(`gitello: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}
