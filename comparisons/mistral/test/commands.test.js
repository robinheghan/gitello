import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git, run, tempRepo, writeCardFile } from './helpers.js';
import { formatCard } from '../src/cards.js';

// --- lists -----------------------------------------------------------------

test('lists: create, list, remove', () => {
  const dir = tempRepo();
  assert.equal(run(dir, ['lists']).stdout, '');
  assert.equal(run(dir, ['lists', 'create', 'Todo']).status, 0);
  assert.equal(run(dir, ['lists', 'create', 'Doing']).status, 0);
  assert.equal(run(dir, ['lists']).stdout, 'Doing\nTodo\n');
  // .gitkeep makes the folder committable.
  assert.ok(fs.existsSync(path.join(dir, 'Todo', '.gitkeep')));
  assert.equal(run(dir, ['lists', 'remove', 'Doing']).status, 0);
  assert.equal(run(dir, ['lists']).stdout, 'Todo\n');
  assert.ok(!fs.existsSync(path.join(dir, 'Doing')));
  // Each mutation auto-committed, leaving a clean tree.
  assert.equal(git(dir, ['status', '--porcelain']).stdout, '');
  const messages = git(dir, ['log', '--format=%s']).stdout.trim().split('\n');
  assert.deepEqual(messages, ['Remove list "Doing"', 'Create list "Doing"', 'Create list "Todo"']);
});

test('lists: duplicate create and unknown remove are errors', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  const dup = run(dir, ['lists', 'create', 'Todo']);
  assert.equal(dup.status, 1);
  assert.match(dup.stderr, /already exists/);
  const missing = run(dir, ['lists', 'remove', 'Nope']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no such list/);
});

test('lists: invalid names are rejected', () => {
  const dir = tempRepo();
  for (const name of ['../evil', 'a/b', '.git', '', '..']) {
    const res = run(dir, ['lists', 'create', name]);
    assert.equal(res.status, 1, `expected failure for ${JSON.stringify(name)}`);
    assert.match(res.stderr, /invalid list name/);
  }
});

// --- cards -----------------------------------------------------------------

test('cards: create, list per list in creation order, recency list of 10', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['lists', 'create', 'Done']);
  assert.equal(run(dir, ['cards', 'Todo', 'create', 'First card']).status, 0);
  assert.equal(run(dir, ['cards', 'Todo', 'create', 'Second card']).status, 0);
  assert.equal(run(dir, ['cards', 'Done', 'create', 'Done card']).status, 0);

  // Cards in a list are printed in creation order.
  assert.equal(run(dir, ['cards', 'Todo']).stdout, 'First card\nSecond card\n');

  // Bare `cards` prints most recently updated first.
  const recent = run(dir, ['cards']).stdout.trim().split('\n');
  assert.deepEqual(recent, ['Done card', 'Second card', 'First card']);

  // `cards --all` prints every card.
  const all = run(dir, ['cards', '--all']).stdout.trim().split('\n');
  assert.equal(all.length, 3);
  assert.ok(all.includes('First card'));

  // Auto-commits left the tree clean.
  assert.equal(git(dir, ['status', '--porcelain']).stdout, '');
});

test('cards: bare listing is limited to the 10 most recent cards', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  for (let i = 1; i <= 12; i++) {
    writeCardFile(dir, 'Todo', `card-${i}.json`, {
      title: `Card ${i}`,
      description: '',
      comments: [],
      createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
      updatedAt: `2026-01-01T01:00:${String(i).padStart(2, '0')}.000Z`
    });
  }
  const recent = run(dir, ['cards']).stdout.trim().split('\n');
  assert.equal(recent.length, 10);
  assert.equal(recent[0], 'Card 12'); // most recent first
  assert.equal(recent[9], 'Card 3');
  const all = run(dir, ['cards', '--all']).stdout.trim().split('\n');
  assert.equal(all.length, 12);
});

test('cards: slug file names and collision suffixes', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['cards', 'Todo', 'create', 'My Card Title!']);
  run(dir, ['cards', 'Todo', 'create', 'My Card Title!']); // same title again
  run(dir, ['cards', 'Todo', 'create', 'my card title']); // same slug
  const files = fs.readdirSync(path.join(dir, 'Todo')).filter((f) => f.endsWith('.json'));
  assert.deepEqual(files.sort(), [
    'my-card-title-2.json',
    'my-card-title-3.json',
    'my-card-title.json'
  ]);
  // All three cards are listed (duplicate titles allowed).
  assert.equal(run(dir, ['cards', 'Todo']).stdout.trim().split('\n').length, 3);
});

test('cards: remove deletes all cards with the title and commits once', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['cards', 'Todo', 'create', 'Dup']);
  run(dir, ['cards', 'Todo', 'create', 'Dup']);
  run(dir, ['cards', 'Todo', 'create', 'Keep']);
  const res = run(dir, ['cards', 'Todo', 'remove', 'Dup']);
  assert.equal(res.status, 0);
  assert.equal(run(dir, ['cards', 'Todo']).stdout, 'Keep\n');
  const files = fs.readdirSync(path.join(dir, 'Todo')).filter((f) => f.endsWith('.json'));
  assert.deepEqual(files, ['keep.json']);
  // Single commit for the removal of both files.
  const head = git(dir, ['show', '--name-only', '--format=', 'HEAD']).stdout.trim().split('\n');
  assert.equal(head.length, 2);
  assert.equal(git(dir, ['status', '--porcelain']).stdout, '');
  const missing = run(dir, ['cards', 'Todo', 'remove', 'Nope']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no card with title/);
});

// --- show --------------------------------------------------------------------

test('cards show: format without other metadata, comment as string', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  writeCardFile(dir, 'Todo', 'c.json', {
    title: 'My card',
    description: 'Line one\nLine two',
    comments: ['a comment'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  });
  const res = run(dir, ['cards', 'show', 'My card']);
  assert.equal(res.status, 0);
  assert.equal(
    res.stdout,
    [
      'My card',
      '',
      'Line one\nLine two',
      '',
      'created: 2026-01-01T00:00:00.000Z',
      'modified: 2026-01-02T00:00:00.000Z',
      '',
      'a comment',
      ''
    ].join('\n')
  );
});

test('cards show: other metadata line and object comments, most recent first', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['lists', 'create', 'Done']);
  const oldCard = {
    title: 'Dup',
    description: 'old',
    comments: [{ author: 'robin', text: 'hi' }, 'plain'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    priority: 'high',
    labels: ['x']
  };
  const newCard = {
    title: 'Dup',
    description: 'new',
    comments: [],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z'
  };
  writeCardFile(dir, 'Todo', 'a.json', oldCard);
  writeCardFile(dir, 'Done', 'b.json', newCard);
  const res = run(dir, ['cards', 'show', 'Dup']);
  assert.equal(res.status, 0);
  // Most recent first: the "Done" card comes before the "Todo" card.
  assert.equal(res.stdout, [formatCard(newCard), formatCard(oldCard)].join('\n\n') + '\n');
  assert.ok(res.stdout.indexOf('new') < res.stdout.indexOf('old'));
  assert.ok(res.stdout.includes('other: {"priority":"high","labels":["x"]}'));
  assert.ok(res.stdout.includes('{"author":"robin","text":"hi"}'));
  assert.ok(res.stdout.includes('plain'));
  // The card without extra metadata has no `other:` line in its own block.
  assert.ok(!formatCard(newCard).includes('other:'));
});

test('cards show: unknown title is an error', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  const res = run(dir, ['cards', 'show', 'Nope']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /no card with title/);
});

// --- move --------------------------------------------------------------------

test('cards move: success, output line, single commit', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['lists', 'create', 'Done']);
  run(dir, ['cards', 'Todo', 'create', 'Task one']);
  const res = run(dir, ['cards', 'Todo', 'move', 'Task one', 'Done']);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, 'Moved card "Task one" from "Todo" to "Done"\n');
  assert.equal(run(dir, ['cards', 'Todo']).stdout, '');
  assert.equal(run(dir, ['cards', 'Done']).stdout, 'Task one\n');
  // File actually moved.
  assert.deepEqual(
    fs.readdirSync(path.join(dir, 'Done')).filter((f) => f.endsWith('.json')),
    ['task-one.json']
  );
  // Single commit containing both the deletion and the addition.
  const nameStatus = git(dir, [
    'show',
    '--no-renames',
    '--name-status',
    '--format=',
    'HEAD'
  ]).stdout;
  assert.match(nameStatus, /D\tTodo\/task-one\.json/);
  assert.match(nameStatus, /A\tDone\/task-one\.json/);
  assert.equal(git(dir, ['status', '--porcelain']).stdout, '');
});

test('cards move: duplicate titles all move, one line each, one commit', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['lists', 'create', 'Done']);
  run(dir, ['cards', 'Todo', 'create', 'Dup']);
  run(dir, ['cards', 'Todo', 'create', 'Dup']);
  const res = run(dir, ['cards', 'Todo', 'move', 'Dup', 'Done']);
  assert.equal(res.status, 0);
  assert.equal(
    res.stdout,
    'Moved card "Dup" from "Todo" to "Done"\nMoved card "Dup" from "Todo" to "Done"\n'
  );
  assert.equal(run(dir, ['cards', 'Done']).stdout, 'Dup\nDup\n');
  assert.equal(
    git(dir, ['log', '-1', '--format=%s']).stdout.trim(),
    'Move card "Dup" from "Todo" to "Done"'
  );
});

test('cards move: target filename collision gets a fresh suffix', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['lists', 'create', 'Done']);
  run(dir, ['cards', 'Done', 'create', 'Same']);
  run(dir, ['cards', 'Todo', 'create', 'Same']);
  const res = run(dir, ['cards', 'Todo', 'move', 'Same', 'Done']);
  assert.equal(res.status, 0);
  const files = fs
    .readdirSync(path.join(dir, 'Done'))
    .filter((f) => f.endsWith('.json'))
    .sort();
  assert.deepEqual(files, ['same-2.json', 'same.json']);
});

test('cards move: all error cases', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  run(dir, ['lists', 'create', 'Done']);
  run(dir, ['cards', 'Todo', 'create', 'Task']);
  const cases = [
    [['cards', 'Nope', 'move', 'Task', 'Done'], /no such list/],
    [['cards', 'Todo', 'move', 'Task', 'Nope'], /no such list/],
    [['cards', 'Todo', 'move', 'Task', 'Todo'], /same list/],
    [['cards', 'Todo', 'move', 'Missing', 'Done'], /no card with title/],
    [['cards', 'Todo', 'move', 'Task'], /quoted|missing argument/],
    [['cards', 'Todo', 'move', 'Task', 'Done', 'extra'], /quoted/]
  ];
  for (const [args, pattern] of cases) {
    const res = run(dir, args);
    assert.equal(res.status, 1, `expected failure for ${args.join(' ')}`);
    assert.match(res.stderr, pattern, `stderr for ${args.join(' ')}`);
  }
});

// --- argument handling / usage -------------------------------------------------

test('unquoted multi-word values produce the quoting error', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  const res = run(dir, ['cards', 'Todo', 'create', 'my', 'card', 'title']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /quoted/);
  const res2 = run(dir, ['lists', 'create', 'my', 'list']);
  assert.equal(res2.status, 1);
  assert.match(res2.stderr, /quoted/);
});

test('unknown command prints usage and exits 1', () => {
  const dir = tempRepo();
  const res = run(dir, ['bogus']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
  assert.match(res.stderr, /gitello cards show <title>/);
});

test('no arguments without a TTY prints usage and exits 1', () => {
  const dir = tempRepo();
  const res = run(dir, []);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
});

test('git proxy runs inside the data repo', () => {
  const dir = tempRepo();
  run(dir, ['lists', 'create', 'Todo']);
  const log = run(dir, ['git', 'log', '--format=%s']);
  assert.equal(log.status, 0);
  assert.match(log.stdout, /Create list "Todo"/);
  // Proxying a failing command passes the exit code through.
  const bad = run(dir, ['git', 'rev-parse', '--verify', 'does-not-exist']);
  assert.equal(bad.status, 128);
});
