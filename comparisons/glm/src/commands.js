import fs from 'node:fs';
import path from 'node:path';

import * as cards from './cards.js';
import * as store from './store.js';

export const RECENT_LIMIT = 10;

export class CommandError extends Error {}

export function validateListName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new CommandError('list name must not be empty');
  }
  if (
    name !== name.trim() ||
    name.startsWith('.') ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  ) {
    throw new CommandError(`invalid list name: ${name}`);
  }
}

export function validateTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new CommandError('card title must not be empty');
  }
}

function rel(repo, target) {
  return path.relative(repo, target);
}

export function listNames(repo) {
  store.ensureRepo(repo);
  const entries = fs.readdirSync(repo, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== '.git')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

function ensureList(repo, name) {
  if (!fs.existsSync(path.join(repo, name))) {
    throw new CommandError(`list not found: ${name}`);
  }
}

export function createList(repo, name) {
  validateListName(name);
  const listPath = path.join(repo, name);
  if (fs.existsSync(listPath)) {
    throw new CommandError(`list already exists: ${name}`);
  }
  store.ensureRepo(repo);
  fs.mkdirSync(listPath, { recursive: true });
  const gitkeep = path.join(listPath, '.gitkeep');
  fs.writeFileSync(gitkeep, '');
  store.commit(repo, [rel(repo, gitkeep)], `Add list "${name}"`);
  return name;
}

export function removeList(repo, name) {
  validateListName(name);
  ensureList(repo, name);
  fs.rmSync(path.join(repo, name), { recursive: true, force: true });
  store.commit(repo, [name], `Remove list "${name}"`);
  return name;
}

// All cards of one list, in creation order.
export function cardsInList(repo, listName) {
  const dir = path.join(repo, listName);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  } catch {
    return [];
  }
  const found = files
    .map((file) => {
      const filePath = path.join(dir, file);
      const card = cards.readCard(filePath);
      return card && typeof card === 'object'
        ? { fileName: file, filePath, card, list: listName }
        : null;
    })
    .filter(Boolean);
  return found.sort((a, b) => {
    const ca = String(a.card.createdAt ?? '');
    const cb = String(b.card.createdAt ?? '');
    if (ca !== cb) {
      return ca < cb ? -1 : 1;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

export function createCard(repo, listName, title) {
  validateTitle(title);
  ensureList(repo, listName);
  const { filePath, card } = cards.createCard(path.join(repo, listName), title);
  store.commit(
    repo,
    [rel(repo, filePath)],
    `Add card "${card.title}" to list "${listName}"`,
  );
  return card;
}

export function removeCards(repo, listName, title) {
  validateTitle(title);
  ensureList(repo, listName);
  const matches = cardsInList(repo, listName).filter(
    (entry) => entry.card.title === title,
  );
  if (matches.length === 0) {
    throw new CommandError(`card not found: ${title}`);
  }
  const paths = [];
  for (const match of matches) {
    fs.rmSync(match.filePath, { force: true });
    paths.push(rel(repo, match.filePath));
  }
  store.commit(repo, paths, `Remove card "${title}" from list "${listName}"`);
  return matches.length;
}

// Move every card with the given title between lists, in a single commit.
export function moveCards(repo, fromName, title, toName) {
  validateTitle(title);
  ensureList(repo, fromName);
  ensureList(repo, toName);
  if (fromName === toName) {
    throw new CommandError(
      `cannot move card "${title}" within the same list: ${fromName}`,
    );
  }
  const matches = cardsInList(repo, fromName).filter(
    (entry) => entry.card.title === title,
  );
  if (matches.length === 0) {
    throw new CommandError(`card not found: ${title}`);
  }
  const toDir = path.join(repo, toName);
  const paths = [];
  for (const match of matches) {
    const toPath = cards.moveCardFile(match.filePath, toDir);
    paths.push(rel(repo, match.filePath), rel(repo, toPath));
  }
  store.commit(
    repo,
    paths,
    `Move card "${title}" from list "${fromName}" to list "${toName}"`,
  );
  return matches;
}

// Cards with the given title across all lists, most recent first.
export function findCards(repo, title) {
  const found = [];
  for (const name of listNames(repo)) {
    for (const entry of cardsInList(repo, name)) {
      if (entry.card.title === title) {
        found.push(entry);
      }
    }
  }
  return found.sort((a, b) => {
    const ua = String(a.card.updatedAt ?? '');
    const ub = String(b.card.updatedAt ?? '');
    return ua > ub ? -1 : ua < ub ? 1 : 0;
  });
}

// The most recently created/modified cards across all lists.
export function recentCards(repo, limit = RECENT_LIMIT) {
  const all = [];
  for (const name of listNames(repo)) {
    all.push(...cardsInList(repo, name));
  }
  return all
    .sort((a, b) => {
      const ua = String(a.card.updatedAt ?? '');
      const ub = String(b.card.updatedAt ?? '');
      return ua > ub ? -1 : ua < ub ? 1 : 0;
    })
    .slice(0, limit);
}
