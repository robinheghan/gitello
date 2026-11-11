import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as cards from '../src/cards.js';
import { sleep } from './helpers.js';

test('sanitize turns titles into slugs', () => {
  assert.equal(cards.sanitize('Hello World'), 'hello-world');
  assert.equal(cards.sanitize('Fix the BUG!'), 'fix-the-bug');
  assert.equal(cards.sanitize('  Spaces   everywhere  '), 'spaces-everywhere');
  assert.equal(cards.sanitize('???'), 'card');
  assert.equal(cards.sanitize('café latte'), 'caf-latte');
});

test('uniqueFileName appends -2, -3, ... on collisions', () => {
  const dir = fs.mkdtempSync('gitello-cards-');
  assert.equal(cards.uniqueFileName(dir, 'fix'), 'fix.json');
  cards.writeCard(path.join(dir, 'fix.json'), { title: 'fix' });
  assert.equal(cards.uniqueFileName(dir, 'fix'), 'fix-2.json');
  cards.writeCard(path.join(dir, 'fix-2.json'), { title: 'fix' });
  assert.equal(cards.uniqueFileName(dir, 'fix'), 'fix-3.json');
});

test('createCard writes the card model and slug file names', () => {
  const dir = fs.mkdtempSync('gitello-cards-');
  const first = cards.createCard(dir, 'Fix Bug!');
  assert.equal(first.fileName, 'fix-bug.json');
  const firstOnDisk = cards.readCard(first.filePath);
  assert.equal(firstOnDisk.title, 'Fix Bug!');
  assert.equal(firstOnDisk.description, '');
  assert.deepEqual(firstOnDisk.comments, []);
  assert.ok(firstOnDisk.createdAt);
  assert.ok(firstOnDisk.updatedAt);
});

test('moveCardFile moves and renames on collision', () => {
  const dirA = fs.mkdtempSync('gitello-cards-');
  const dirB = fs.mkdtempSync('gitello-cards-');
  const card = cards.createCard(dirA, 'fix');
  cards.createCard(dirB, 'fix');
  const toPath = cards.moveCardFile(card.filePath, dirB);
  assert.equal(path.basename(toPath), 'fix-2.json');
  assert.ok(!fs.existsSync(card.filePath));
  assert.ok(fs.existsSync(toPath));
});

test('formatMeta renders timestamps and optional extra metadata', () => {
  assert.equal(
    cards.formatMeta({ createdAt: 'c', updatedAt: 'm' }),
    'created: c\nmodified: m',
  );
  assert.equal(
    cards.formatMeta({
      title: 't',
      description: '',
      comments: [],
      createdAt: 'c',
      updatedAt: 'm',
    }),
    'created: c\nmodified: m',
  );
  assert.equal(
    cards.formatMeta({
      title: 't',
      createdAt: 'c',
      updatedAt: 'm',
      color: 'red',
      blocked: true,
    }),
    'created: c\nmodified: m\nother: {"color":"red","blocked":true}',
  );
  // missing fields render empty, never "undefined"
  assert.ok(!cards.formatMeta({}).includes('undefined'));
});

test('formatComments renders strings as-is and objects as JSON', () => {
  assert.deepEqual(
    cards.formatComments(['plain', { author: 'rob', ok: true }]),
    ['plain', '{"author":"rob","ok":true}'],
  );
  assert.deepEqual(cards.formatComments(undefined), []);
});

test('formatCard renders the full card output', () => {
  const card = {
    title: 'fix the bug',
    description: 'It crashes on start',
    comments: ['first comment', { author: 'rob' }],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  };
  const text = cards.formatCard(card);
  assert.ok(text.startsWith('fix the bug\n\nIt crashes on start\n\n'));
  assert.ok(text.includes('created: 2025-01-01T00:00:00.000Z'));
  assert.ok(text.includes('modified: 2025-01-02T00:00:00.000Z'));
  assert.ok(text.includes('first comment'));
  assert.ok(text.includes('{"author":"rob"}'));
  assert.ok(!text.includes('other:'));
  assert.equal(cards.formatCard({}), '\n\n\n\ncreated: \nmodified: ');
});

test('parseComments turns lines into strings and JSON objects', () => {
  assert.deepEqual(cards.parseComments('hello\n{"author":"rob"}\n42\n\n'), [
    'hello',
    { author: 'rob' },
    '42',
  ]);
  assert.deepEqual(cards.parseComments(''), []);
});

test('updateCard bumps updatedAt and keeps createdAt and extras', async () => {
  const dir = fs.mkdtempSync('gitello-cards-');
  const { filePath } = cards.createCard(dir, 'keep');
  const before = cards.readCard(filePath);
  await sleep(5);
  const updated = cards.updateCard(filePath, {
    title: 'keep',
    description: 'new text',
    comments: ['note'],
  });
  assert.equal(updated.createdAt, before.createdAt);
  assert.notEqual(updated.updatedAt, before.updatedAt);
  assert.equal(updated.description, 'new text');
  const withExtra = { ...cards.readCard(filePath), color: 'blue' };
  cards.writeCard(filePath, withExtra);
  const updatedAgain = cards.updateCard(filePath, { title: 'keep' });
  assert.equal(updatedAgain.color, 'blue');
  assert.equal(updatedAgain.createdAt, before.createdAt);
});
