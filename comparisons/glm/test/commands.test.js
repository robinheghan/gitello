import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as cards from '../src/cards.js';
import * as commands from '../src/commands.js';
import { CommandError } from '../src/commands.js';
import * as store from '../src/store.js';
import { isolatedRepo, commitCount, sleep } from './helpers.js';

test('lists: create, list and remove, including .gitkeep and commits', () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  assert.ok(fs.existsSync(path.join(repo, 'todo', '.gitkeep')));
  assert.equal(store.lastMessage(repo), 'Add list "todo"');
  commands.createList(repo, 'done');
  assert.deepEqual(commands.listNames(repo), ['done', 'todo']);

  commands.removeList(repo, 'done');
  assert.deepEqual(commands.listNames(repo), ['todo']);
  assert.equal(store.lastMessage(repo), 'Remove list "done"');
  assert.ok(!fs.existsSync(path.join(repo, 'done')));
});

test('lists: duplicate and invalid names are rejected', async () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  assert.throws(
    () => commands.createList(repo, 'todo'),
    (err) =>
      err instanceof CommandError && err.message.includes('already exists'),
  );
  for (const bad of ['', '   ', '.git', '../escape', 'a/b']) {
    assert.throws(
      () => commands.createList(repo, bad),
      (err) => err instanceof CommandError,
    );
  }
});

test('cards: create with slug names and collision suffixes', () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  const card = commands.createCard(repo, 'todo', 'Fix Bug!');
  assert.ok(fs.existsSync(path.join(repo, 'todo', 'fix-bug.json')));
  assert.equal(card.title, 'Fix Bug!');
  assert.equal(store.lastMessage(repo), 'Add card "Fix Bug!" to list "todo"');
  commands.createCard(repo, 'todo', 'fix bug');
  assert.ok(fs.existsSync(path.join(repo, 'todo', 'fix-bug-2.json')));

  assert.throws(
    () => commands.createCard(repo, 'missing', 'x'),
    (err) =>
      err instanceof CommandError && err.message.includes('list not found'),
  );
});

test('cards in a list are reported in creation order', async () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  for (const title of ['first', 'second', 'third']) {
    commands.createCard(repo, 'todo', title);
    await sleep(2);
  }
  const titles = commands.cardsInList(repo, 'todo').map((c) => c.card.title);
  assert.deepEqual(titles, ['first', 'second', 'third']);
});

test('recentCards returns the ten most recently modified cards', async () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  commands.createList(repo, 'other');
  for (let i = 1; i <= 12; i += 1) {
    commands.createCard(repo, 'todo', `card ${i}`);
    await sleep(2);
  }
  let recent = commands.recentCards(repo);
  assert.equal(recent.length, 10);
  assert.equal(recent[0].card.title, 'card 12');
  assert.equal(recent[9].card.title, 'card 3');
  assert.deepEqual(commands.recentCards(repo, 3).length, 3);

  // touching an old card makes it the most recent
  const entry = commands
    .cardsInList(repo, 'todo')
    .find((candidate) => candidate.card.title === 'card 2');
  await sleep(2);
  cards.updateCard(entry.filePath, { description: 'updated' });
  recent = commands.recentCards(repo);
  assert.equal(recent[0].card.title, 'card 2');
});

test('removeCards removes every matching card in one commit', () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  commands.createCard(repo, 'todo', 'fix');
  commands.createCard(repo, 'todo', 'fix');
  const before = commitCount(repo);
  const removed = commands.removeCards(repo, 'todo', 'fix');
  assert.equal(removed, 2);
  assert.deepEqual(commands.cardsInList(repo, 'todo'), []);
  assert.equal(commitCount(repo), before + 1);
  assert.equal(store.lastMessage(repo), 'Remove card "fix" from list "todo"');

  assert.throws(
    () => commands.removeCards(repo, 'todo', 'fix'),
    (err) => err instanceof CommandError && err.message.includes('not found'),
  );
});

test('moveCards moves every duplicate in a single commit', () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  commands.createList(repo, 'done');
  commands.createCard(repo, 'todo', 'fix');
  commands.createCard(repo, 'todo', 'fix');
  const before = commitCount(repo);

  const moved = commands.moveCards(repo, 'todo', 'fix', 'done');
  assert.equal(moved.length, 2);
  assert.equal(commitCount(repo), before + 1);
  assert.deepEqual(commands.cardsInList(repo, 'todo'), []);
  assert.equal(commands.cardsInList(repo, 'done').length, 2);
  assert.equal(
    store.lastMessage(repo),
    'Move card "fix" from list "todo" to list "done"',
  );

  const oneMidMove = commands.moveCards(repo, 'done', 'fix', 'todo')[0];
  assert.ok(fs.existsSync(path.join(repo, 'todo', oneMidMove.fileName)));
});

test('moveCards validates lists, same-list moves and missing cards', async () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  commands.createCard(repo, 'todo', 'fix');

  const expectError = (worker, match) =>
    assert.throws(
      worker,
      (err) => err instanceof CommandError && err.message.includes(match),
    );
  expectError(
    () => commands.moveCards(repo, 'todo', 'fix', 'nope'),
    'not found',
  );
  expectError(
    () => commands.moveCards(repo, 'nowhere', 'fix', 'todo'),
    'not found',
  );
  expectError(
    () => commands.moveCards(repo, 'todo', 'fix', 'todo'),
    'same list',
  );
  expectError(
    () => commands.moveCards(repo, 'todo', 'missing', 'nope'),
    'not found',
  );
});

test('moving onto a colliding file name picks a fresh suffix', () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  commands.createList(repo, 'done');
  commands.createCard(repo, 'todo', 'fix');
  commands.createCard(repo, 'done', 'fix');
  commands.moveCards(repo, 'todo', 'fix', 'done');
  const names = commands
    .cardsInList(repo, 'done')
    .map((entry) => entry.fileName)
    .sort();
  assert.deepEqual(names, ['fix-2.json', 'fix.json']);
});

test('findCards searches across lists, most recent first', async () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;

  commands.createList(repo, 'todo');
  commands.createList(repo, 'done');
  commands.createCard(repo, 'todo', 'fix');
  await sleep(2);
  commands.createCard(repo, 'done', 'fix');
  const found = commands.findCards(repo, 'fix');
  assert.equal(found.length, 2);
  assert.equal(found[0].list, 'done');
  assert.equal(found[1].list, 'todo');
  assert.deepEqual(commands.findCards(repo, 'missing'), []);
});
