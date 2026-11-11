import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as cards from '../src/cards.js';
import { main, USAGE } from '../src/cli.js';
import * as commands from '../src/commands.js';
import { isolatedRepo, sleep } from './helpers.js';

async function call(argv, io = { tty: false, gitStdio: 'ignore' }) {
  const out = {
    chunks: [],
    write(text) {
      this.chunks.push(String(text));
    },
  };
  const err = {
    chunks: [],
    write(text) {
      this.chunks.push(String(text));
    },
  };
  const code = await main(argv, { stdout: out, stderr: err, ...io });
  return { code, out: out.chunks.join(''), err: err.chunks.join('') };
}

async function setupTwoLists(repo) {
  await call(['lists', 'create', 'todo']);
  await call(['lists', 'create', 'done']);
}

test('no arguments without a TTY prints usage and exits 1', async () => {
  const { code, err } = await call([]);
  assert.equal(code, 1);
  assert.ok(err.includes('usage'));
  assert.ok(err.includes('gitello lists'));
});

test('unknown commands print usage and exit 1', async () => {
  const { code, err } = await call(['bogus']);
  assert.equal(code, 1);
  assert.ok(err.includes(USAGE));
});

test('lists create/remove/list via the CLI', async () => {
  isolatedRepo();
  const created = await call(['lists', 'create', 'to do']);
  assert.equal(created.code, 0);
  const { out } = await call(['lists']);
  assert.equal(out.trim(), 'to do');
  const removed = await call(['lists', 'remove', 'to do']);
  assert.equal(removed.code, 0);
  const empty = await call(['lists']);
  assert.equal(empty.out, '');
});

test('multi-word values must be quoted', async () => {
  isolatedRepo();
  const { code, err } = await call(['lists', 'create', 'to', 'do']);
  assert.equal(code, 1);
  assert.ok(err.includes('quoted'));
  const tooFew = await call(['lists', 'create']);
  assert.equal(tooFew.code, 1);
  assert.ok(tooFew.err.includes('missing argument'));
});

test('cards: create, list, and slug collisions', async () => {
  const repo = isolatedRepo();
  await call(['lists', 'create', 'todo']);
  const ok = await call(['cards', 'todo', 'create', 'Fix Bug!']);
  assert.equal(ok.code, 0);
  assert.ok(fs.existsSync(path.join(repo, 'todo', 'fix-bug.json')));

  const again = await call(['cards', 'todo', 'create', 'fix bug']);
  assert.equal(again.code, 0);
  assert.ok(fs.existsSync(path.join(repo, 'todo', 'fix-bug-2.json')));

  const { out } = await call(['cards', 'todo']);
  assert.equal(out.trim(), 'Fix Bug!\nfix bug');
});

test('cards: recent ten, --all, and per-list output', async () => {
  isolatedRepo();
  await setupTwoLists(process.env.GITELLO_PATH);
  for (let i = 1; i <= 12; i += 1) {
    await call(['cards', 'todo', 'create', `card ${i}`]);
    await sleep(2);
  }
  const recent = await call(['cards']);
  assert.equal(recent.code, 0);
  const recentTitles = recent.out.trim().split('\n');
  assert.equal(recentTitles.length, 10);
  assert.equal(recentTitles[0], 'card 12');
  assert.equal(recentTitles[9], 'card 3');

  const all = await call(['cards', '--all']);
  assert.equal(all.out.trim().split('\n').length, 12);

  const gone = await call(['cards', 'done']);
  assert.equal(gone.out, '');
});

test('cards show prints card contents, most recent first', async () => {
  isolatedRepo();
  await setupTwoLists(process.env.GITELLO_PATH);
  await call(['cards', 'todo', 'create', 'fix']);
  await sleep(2);
  await call(['cards', 'done', 'create', 'fix']);
  const { code, out } = await call(['cards', 'show', 'fix']);
  assert.equal(code, 0);
  assert.ok(out.startsWith('fix\n\n\n'));
  assert.ok(out.includes('created: '));
  assert.ok(out.includes('modified: '));
  const todoPos = out.indexOf('created:');
  assert.ok(out.indexOf('modified:', todoPos) > 0);
  // both cards appear
  assert.equal(out.split('fix\n').length - 1, 2);

  const missing = await call(['cards', 'show', 'missing']);
  assert.equal(missing.code, 1);
  assert.ok(missing.err.includes('card not found: missing'));
});

test('move prints one line per card and validates arguments', async () => {
  isolatedRepo();
  await setupTwoLists(process.env.GITELLO_PATH);
  await call(['cards', 'todo', 'create', 'fix']);
  await call(['cards', 'todo', 'create', 'fix']);

  const { code, out } = await call(['cards', 'todo', 'move', 'fix', 'done']);
  assert.equal(code, 0);
  assert.equal(
    out,
    'Moved card "fix" from list "todo" to list "done"\n' +
      'Moved card "fix" from list "todo" to list "done"\n',
  );
  const inDone = await call(['cards', 'done']);
  assert.equal(inDone.out.trim(), 'fix\nfix');

  const same = await call(['cards', 'todo', 'move', 'fix', 'todo']);
  assert.equal(same.code, 1);
  assert.ok(same.err.includes('same list'));

  const unknown = await call(['cards', 'nowhere', 'move', 'fix', 'done']);
  assert.equal(unknown.code, 1);
  assert.ok(unknown.err.includes('list not found'));

  const tooMany = await call(['cards', 'todo', 'move', 'fix', 'done', 'x']);
  assert.equal(tooMany.code, 1);
  assert.ok(tooMany.err.includes('quoted'));
});

test('cards remove removes duplicates; unknown lists and cards fail', async () => {
  isolatedRepo();
  await setupTwoLists(process.env.GITELLO_PATH);
  await call(['cards', 'todo', 'create', 'fix']);
  await call(['cards', 'todo', 'create', 'fix']);
  const removed = await call(['cards', 'todo', 'remove', 'fix']);
  assert.equal(removed.code, 0);
  const none = await call(['cards', 'todo', 'remove', 'fix']);
  assert.equal(none.code, 1);
  assert.ok(none.err.includes('card not found: fix'));

  const unknownList = await call(['cards', 'nowhere']);
  assert.equal(unknownList.code, 1);
  assert.ok(unknownList.err.includes('list not found: nowhere'));
});

test('invalid names and empty titles are rejected', async () => {
  isolatedRepo();
  await call(['lists', 'create', 'todo']);
  const badList = await call(['lists', 'create', '.git']);
  assert.equal(badList.code, 1);
  assert.ok(badList.err.includes('invalid list name'));

  const dup = await call(['lists', 'create', 'todo']);
  assert.equal(dup.code, 1);
  assert.ok(dup.err.includes('list already exists'));

  const emptyTitle = await call(['cards', 'todo', 'create', '  ']);
  assert.equal(emptyTitle.code, 1);
  assert.ok(emptyTitle.err.includes('title must not be empty'));
});

test('git proxy passes exit codes through', async () => {
  isolatedRepo();
  await setupTwoLists(process.env.GITELLO_PATH);
  const bad = await call(['git', 'rev-parse', '--verify', 'HEAD~99']);
  assert.notEqual(bad.code, 0);
  await call(['cards', 'todo', 'create', 'fix']);
  const good = await call(['git', 'rev-parse', 'HEAD']);
  assert.equal(good.code, 0);
  const noArgs = await call(['git']);
  assert.equal(noArgs.code, 1);
  assert.ok(noArgs.err.includes('missing git command'));
});

test('repo contents referenced above exist', async () => {
  const repo = isolatedRepo();
  await setupTwoLists(repo);
  const lists = commands.listNames(repo);
  assert.deepEqual(lists, ['done', 'todo']);
  assert.ok(cards.sanitize('check') === 'check');
});
