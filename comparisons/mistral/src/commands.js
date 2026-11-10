import fs from 'node:fs';
import path from 'node:path';
import {
  allCards,
  cardsInList,
  findCards,
  formatCard,
  isValidListName,
  listExists,
  listNames,
  newCard,
  uniqueFileName,
  writeCard
} from './cards.js';
import { autoCommit, ensureRepo, gitProxy, repoPath } from './store.js';

export class CommandError extends Error {
  constructor(message, { showUsage = false } = {}) {
    super(message);
    this.showUsage = showUsage;
  }
}

function fail(message, opts) {
  throw new CommandError(message, opts);
}

const QUOTE_HINT = 'multi-word values must be passed as a single quoted argument, e.g. "my list"';

/** Expect exactly `n` arguments; more means an unquoted multi-word value. */
function expectArgs(args, n) {
  if (args.length > n) fail(QUOTE_HINT);
  if (args.length < n) fail(`missing argument (expected ${n}, got ${args.length})`);
}

function requireList(repo, name) {
  if (!isValidListName(name)) fail(`invalid list name: "${name}"`);
  if (!listExists(repo, name)) fail(`no such list: "${name}"`);
}

// --- lists -----------------------------------------------------------------

function listsCommand(args) {
  if (args.length === 0) {
    const repo = ensureRepo();
    for (const name of listNames(repo)) console.log(name);
    return 0;
  }
  const [sub, ...rest] = args;
  if (sub === 'create') {
    expectArgs(rest, 1);
    const [name] = rest;
    if (!isValidListName(name)) fail(`invalid list name: "${name}"`);
    const repo = ensureRepo();
    if (listExists(repo, name)) fail(`list already exists: "${name}"`);
    const dir = path.join(repo, name);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    fs.writeFileSync(keep, '');
    autoCommit(keep, `Create list "${name}"`);
    return 0;
  }
  if (sub === 'remove') {
    expectArgs(rest, 1);
    const [name] = rest;
    const repo = ensureRepo();
    requireList(repo, name);
    const dir = path.join(repo, name);
    fs.rmSync(dir, { recursive: true, force: true });
    autoCommit(dir, `Remove list "${name}"`);
    return 0;
  }
  fail(`unknown lists subcommand: "${sub}"`, { showUsage: true });
}

// --- cards -----------------------------------------------------------------

function cardsCommand(args) {
  const repo = ensureRepo();

  if (args.length === 0) {
    // Ten most recently created/modified cards, most recent first.
    for (const entry of allCards(repo).slice(0, 10)) console.log(entry.card.title);
    return 0;
  }

  const [first, ...rest] = args;

  if (first === '--all') {
    expectArgs(rest, 0);
    for (const entry of allCards(repo)) console.log(entry.card.title);
    return 0;
  }

  if (first === 'show') {
    expectArgs(rest, 1);
    const [title] = rest;
    const matches = allCards(repo).filter((e) => e.card.title === title);
    if (matches.length === 0) fail(`no card with title: "${title}"`);
    console.log(matches.map((e) => formatCard(e.card)).join('\n\n'));
    return 0;
  }

  // From here on the first argument is a list name.
  const list = first;
  requireList(repo, list);

  if (rest.length === 0) {
    for (const entry of cardsInList(repo, list)) console.log(entry.card.title);
    return 0;
  }

  const [sub, ...subRest] = rest;

  if (sub === 'create') {
    expectArgs(subRest, 1);
    const [title] = subRest;
    if (!title || !title.trim()) fail('card title must not be empty');
    const dir = path.join(repo, list);
    const file = path.join(dir, uniqueFileName(dir, title));
    writeCard(file, newCard(title));
    autoCommit(file, `Create card "${title}" in list "${list}"`);
    return 0;
  }

  if (sub === 'remove') {
    expectArgs(subRest, 1);
    const [title] = subRest;
    const matches = findCards(repo, list, title);
    if (matches.length === 0) fail(`no card with title "${title}" in list "${list}"`);
    for (const m of matches) fs.rmSync(m.file, { force: true });
    autoCommit(
      matches.map((m) => m.file),
      `Remove card "${title}" from list "${list}"`
    );
    return 0;
  }

  if (sub === 'move') {
    expectArgs(subRest, 2);
    const [title, toList] = subRest;
    if (toList === list) fail('cannot move a card to the same list it is already in');
    requireList(repo, toList);
    const matches = findCards(repo, list, title);
    if (matches.length === 0) fail(`no card with title "${title}" in list "${list}"`);
    const fromDir = path.join(repo, list);
    const toDir = path.join(repo, toList);
    const paths = [];
    for (const m of matches) {
      const toFile = path.join(toDir, uniqueFileName(toDir, m.card.title));
      fs.renameSync(m.file, toFile);
      paths.push(m.file, toFile);
      console.log(`Moved card "${m.card.title}" from "${list}" to "${toList}"`);
    }
    autoCommit(paths, `Move card "${title}" from "${list}" to "${toList}"`);
    return 0;
  }

  fail(`unknown cards subcommand: "${sub}"`, { showUsage: true });
}

// --- dispatch ----------------------------------------------------------------

export function runCommand(argv) {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case 'lists':
      return listsCommand(args);
    case 'cards':
      return cardsCommand(args);
    case 'git':
      if (args.length === 0) fail('usage: gitello git <args...>');
      return gitProxy(args);
    default:
      fail(`unknown command: "${cmd}"`, { showUsage: true });
  }
}

export { repoPath };
