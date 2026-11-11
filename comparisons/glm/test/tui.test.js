import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as cards from '../src/cards.js';
import * as commands from '../src/commands.js';
import * as store from '../src/store.js';
import * as tui from '../src/tui.js';
import { isolatedRepo, commitCount, sleep } from './helpers.js';

const emptyModel = () => ({ lists: [] });

const simpleModel = () => ({
  lists: [
    {
      name: 'todo',
      cards: [
        { card: { title: 'first', createdAt: '1' } },
        { card: { title: 'second', createdAt: '2' } },
        { card: { title: 'third', createdAt: '3' } },
      ],
    },
    {
      name: 'done',
      cards: [{ card: { title: 'shipped', createdAt: '4' } }],
    },
  ],
});

test('buildModel reads lists and cards from a repo', async () => {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;
  commands.createList(repo, 'todo');
  commands.createCard(repo, 'todo', 'fix');
  const model = tui.buildModel(repo);
  assert.equal(model.lists.length, 1);
  assert.equal(model.lists[0].name, 'todo');
  assert.equal(model.lists[0].cards.length, 1);
  assert.equal(model.lists[0].cards[0].card.title, 'fix');
  // an empty but existing repo yields an empty board
  commands.createList(repo, 'empty');
  const fresh = isolatedRepo();
  assert.equal(tui.buildModel(fresh).lists.length, 0);
});

test('applyKey navigates with hjkl and arrows, clamped at the edges', () => {
  const model = simpleModel();
  const s = { list: 0, card: 0 };

  let d = tui.applyKey(s, model, 'j');
  assert.equal(d.type, 'nav');
  assert.deepEqual(d.state, { list: 0, card: 1 });
  d = tui.applyKey(d.state, model, 'down');
  assert.deepEqual(d.state, { list: 0, card: 2 });
  d = tui.applyKey(d.state, model, 'j');
  assert.deepEqual(d.state, { list: 0, card: 2 }); // clamped
  d = tui.applyKey(d.state, model, 'k');
  assert.deepEqual(d.state, { list: 0, card: 1 });
  d = tui.applyKey({ list: 0, card: 0 }, model, 'up');
  assert.deepEqual(d.state, { list: 0, card: 0 }); // clamped

  d = tui.applyKey({ list: 0, card: 1 }, model, 'l');
  assert.deepEqual(d.state, { list: 1, card: 0 }); // clamp to other list
  d = tui.applyKey({ list: 1, card: 0 }, model, 'right');
  assert.deepEqual(d.state, { list: 1, card: 0 });
  d = tui.applyKey({ list: 0, card: 0 }, model, 'h');
  assert.deepEqual(d.state, { list: 0, card: 0 }); // clamped at first list
});

test('applyKey on an empty board is a noop, quit keys quit', () => {
  const model = emptyModel();
  assert.equal(tui.applyKey({ list: 0, card: 0 }, model, 'j').type, 'noop');
  assert.equal(tui.applyKey({ list: 0, card: 0 }, model, 'l').type, 'noop');
  for (const key of ['q', 'escape', 'C-c']) {
    assert.equal(tui.applyKey({ list: 0, card: 0 }, model, key).type, 'quit');
  }
  assert.equal(
    tui.applyKey({ list: 0, card: 0 }, simpleModel(), 'q').type,
    'quit',
  );
  assert.equal(
    tui.applyKey({ list: 0, card: 0 }, simpleModel(), 'x').type,
    'none',
  );
});

test('applyKey maps shift-moves and no-op vertical shifts', () => {
  const s = { list: 0, card: 0 };
  assert.deepEqual(tui.applyKey(s, simpleModel(), 'S-h'), {
    type: 'move',
    dx: -1,
  });
  assert.deepEqual(tui.applyKey(s, simpleModel(), 'S-left'), {
    type: 'move',
    dx: -1,
  });
  assert.deepEqual(tui.applyKey(s, simpleModel(), 'S-l'), {
    type: 'move',
    dx: 1,
  });
  assert.deepEqual(tui.applyKey(s, simpleModel(), 'S-right'), {
    type: 'move',
    dx: 1,
  });
  for (const key of ['S-j', 'S-down', 'S-k', 'S-up']) {
    assert.equal(tui.applyKey(s, simpleModel(), key).type, 'noop');
  }
});

test('applyKey opens the card modal with space', () => {
  assert.equal(
    tui.applyKey({ list: 0, card: 0 }, simpleModel(), 'space').type,
    'toggleCard',
  );
  // no card selected in an empty list
  assert.equal(
    tui.applyKey(
      { list: 1, card: 0 },
      { lists: [{ name: 'todo', cards: [] }] },
      'space',
    ).type,
    'noop',
  );
});

test('renderColumn highlights the selected card and the active list', () => {
  const model = simpleModel();
  const active = tui.renderColumn(model.lists[0], 1, true);
  assert.equal(active.label, '{cyan-fg}todo{/}');
  assert.equal(active.content, 'first\n{inverse}second{/}\nthird');
  const inactive = tui.renderColumn(model.lists[0], -1, false);
  assert.equal(inactive.label, 'todo');
  assert.equal(inactive.content, 'first\nsecond\nthird');
});

test('applyModalKey cycles fields and handles save/close', () => {
  assert.deepEqual(tui.applyModalKey('tab', 0, 3), { type: 'focus', focus: 1 });
  assert.deepEqual(tui.applyModalKey('tab', 1, 3), { type: 'focus', focus: 2 });
  assert.deepEqual(tui.applyModalKey('tab', 2, 3), { type: 'focus', focus: 0 });
  assert.deepEqual(tui.applyModalKey('S-tab', 2, 3), {
    type: 'focus',
    focus: 1,
  });
  assert.deepEqual(tui.applyModalKey('S-tab', 0, 3), {
    type: 'focus',
    focus: 2,
  });
  assert.deepEqual(tui.applyModalKey('enter', 1, 3), { type: 'save' });
  assert.deepEqual(tui.applyModalKey('C-q', 0, 3), { type: 'close' });
  assert.deepEqual(tui.applyModalKey('a', 0, 3), { type: 'none' });
  assert.deepEqual(tui.applyModalKey('space', 0, 3), { type: 'none' });
});

async function fixture() {
  const repo = isolatedRepo();
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;
  commands.createList(repo, 'todo');
  commands.createList(repo, 'done');
  commands.createCard(repo, 'todo', 'fix the bug');
  await sleep(2);
  commands.createCard(repo, 'todo', 'write docs');
  return repo;
}

const listOf = (model, name) => model.lists.findIndex((l) => l.name === name);

test('performMove moves the selected card between lists and commits', async () => {
  const repo = await fixture();
  const model = tui.buildModel(repo);
  const before = commitCount(repo);
  const modelTodo = listOf(model, 'todo');
  const dx = listOf(model, 'done') - modelTodo;

  const result = tui.performMove(repo, model, { list: modelTodo, card: 0 }, dx);
  assert.ok(!result.error, String(result.error));
  assert.ok(!fs.existsSync(path.join(repo, 'todo', 'fix-the-bug.json')));
  assert.ok(fs.existsSync(path.join(repo, 'done', 'fix-the-bug.json')));
  assert.equal(commitCount(repo), before + 1);
  assert.equal(
    store.lastMessage(repo),
    'Move card "fix the bug" from list "todo" to list "done"',
  );
  assert.equal(
    result.model.lists.find((l) => l.name === 'done').cards.length,
    1,
  );
  assert.equal(result.model.lists[result.state.list].name, 'done');

  // blocked beyond the board edges
  const lastList = result.model.lists.length - 1;
  assert.ok(
    tui.performMove(repo, result.model, { list: lastList, card: 0 }, 1).error,
  );
  assert.ok(
    tui.performMove(repo, result.model, { list: 0, card: 0 }, -1).error,
  );
});

test('performMove renames colliding file names', async () => {
  const repo = await fixture();
  commands.createCard(repo, 'done', 'fix the bug');
  const model = tui.buildModel(repo);
  const result = tui.performMove(
    repo,
    model,
    { list: listOf(model, 'todo'), card: 0 },
    listOf(model, 'done') - listOf(model, 'todo'),
  );
  assert.ok(!result.error, String(result.error));
  assert.ok(fs.existsSync(path.join(repo, 'done', 'fix-the-bug-2.json')));
});

test('performUpdate saves modal values and commits', async () => {
  const repo = await fixture();
  const model = tui.buildModel(repo);
  const before = commitCount(repo);
  const entry = model.lists.find((l) => l.name === 'todo').cards[0];

  const result = tui.performUpdate(
    repo,
    model,
    { list: listOf(model, 'todo'), card: 0 },
    {
      title: 'fix the bug',
      description: 'it crashes on start',
      comments: 'note\n{"author":"rob"}',
    },
  );
  assert.ok(!result.error);
  assert.equal(commitCount(repo), before + 1);
  assert.equal(
    store.lastMessage(repo),
    'Update card "fix the bug" in list "todo"',
  );
  const saved = cards.readCard(entry.filePath);
  assert.equal(saved.description, 'it crashes on start');
  assert.deepEqual(saved.comments, ['note', { author: 'rob' }]);
  assert.ok(Date.parse(saved.updatedAt) > Date.parse(saved.createdAt));
});

test('performUpdate rejects an empty title without saving', async () => {
  const repo = await fixture();
  const model = tui.buildModel(repo);
  const before = commitCount(repo);
  const result = tui.performUpdate(
    repo,
    model,
    { list: 0, card: 0 },
    {
      title: '   ',
      description: 'x',
      comments: '',
    },
  );
  assert.equal(result.error, 'title must not be empty');
  assert.equal(commitCount(repo), before);
});

test('initialState and clampState behave on empty and normal boards', () => {
  assert.deepEqual(tui.initialState(), { list: 0, card: 0 });
  assert.deepEqual(tui.clampState({ list: 5, card: 9 }, emptyModel()), {
    list: 0,
    card: 0,
  });
  assert.deepEqual(tui.clampState({ list: 9, card: 9 }, simpleModel()), {
    list: 1,
    card: 0,
  });
});
