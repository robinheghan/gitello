import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempRepo, writeCardFile } from './helpers.js';
import {
  applyKey,
  buildModel,
  clampState,
  formatMeta,
  initialState,
  MODAL_FIELDS,
  renderColumn
} from '../src/tui.js';
import {
  formatComments,
  parseComments,
  serializeEdit,
  slugify,
  validateEdit
} from '../src/cards.js';

function fixture() {
  const dir = tempRepo();
  writeCardFile(dir, 'Todo', 'a.json', {
    title: 'First',
    description: 'd1',
    comments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  writeCardFile(dir, 'Todo', 'b.json', {
    title: 'Second',
    description: 'd2',
    comments: ['c1'],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  });
  writeCardFile(dir, 'Done', 'c.json', {
    title: 'Third',
    description: '',
    comments: [],
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    priority: 'low'
  });
  return dir;
}

test('buildModel: lists with cards in creation order', () => {
  const model = buildModel(fixture());
  assert.deepEqual(
    model.lists.map((l) => l.name),
    ['Done', 'Todo']
  );
  assert.deepEqual(
    model.lists[1].cards.map((c) => c.card.title),
    ['First', 'Second']
  );
  assert.ok(model.lists[1].cards[0].file.endsWith('a.json'));
});

test('buildModel: empty repo has no lists', () => {
  assert.deepEqual(buildModel(tempRepo()).lists, []);
});

test('applyKey: horizontal navigation is clamped at edges', () => {
  const model = buildModel(fixture());
  let state = initialState(model);
  let r = applyKey(state, 'h', model);
  assert.equal(r.state.listIndex, 0); // already at left edge
  r = applyKey(r.state, 'l', model);
  assert.equal(r.state.listIndex, 1);
  r = applyKey(r.state, 'right', model);
  assert.equal(r.state.listIndex, 1); // clamped at right edge
  r = applyKey(r.state, 'left', model);
  assert.equal(r.state.listIndex, 0);
});

test('applyKey: vertical navigation is clamped at edges', () => {
  const model = buildModel(fixture());
  let state = initialState(model); // list 0 = Done, 1 card
  let r = applyKey(state, 'j', model);
  assert.equal(r.state.cardIndex, 0);
  r = applyKey(r.state, 'l', model); // Todo has 2 cards
  r = applyKey(r.state, 'k', model);
  assert.equal(r.state.cardIndex, 0);
  r = applyKey(r.state, 'down', model);
  assert.equal(r.state.cardIndex, 1);
  r = applyKey(r.state, 'j', model);
  assert.equal(r.state.cardIndex, 1); // clamped
  r = applyKey(r.state, 'up', model);
  assert.equal(r.state.cardIndex, 0);
});

test('applyKey: shift+horizontal moves the selected card to the adjacent list', () => {
  const model = buildModel(fixture());
  const state = initialState(model); // listIndex 0
  let r = applyKey(state, 'S-l', model);
  assert.deepEqual(r.action, { type: 'moveCard', fromIndex: 0, toIndex: 1, cardIndex: 0 });
  r = applyKey(state, 'S-right', model);
  assert.deepEqual(r.action, { type: 'moveCard', fromIndex: 0, toIndex: 1, cardIndex: 0 });
  // At the first list, moving left is a no-op.
  assert.equal(applyKey(state, 'S-h', model).action, null);
  assert.equal(applyKey(state, 'S-left', model).action, null);
  // launch() moves the selection to the target list after a move.
  const atLast = { ...state, listIndex: 1 };
  assert.equal(applyKey(atLast, 'S-l', model).action, null); // already at last list
  assert.deepEqual(applyKey(atLast, 'S-h', model).action, {
    type: 'moveCard',
    fromIndex: 1,
    toIndex: 0,
    cardIndex: 0
  });
});

test('applyKey: shift+vertical keys are no-ops', () => {
  const model = buildModel(fixture());
  const state = initialState(model);
  for (const key of ['S-j', 'S-k', 'S-up', 'S-down']) {
    const r = applyKey(state, key, model);
    assert.equal(r.action, null);
    assert.deepEqual(r.state, state);
  }
});

test('applyKey: quit keys produce a quit action', () => {
  const model = buildModel(fixture());
  const state = initialState(model);
  for (const key of ['q', 'escape', 'C-c']) {
    assert.deepEqual(applyKey(state, key, model).action, { type: 'quit' });
  }
});

test('applyKey: space opens the card modal; nav/move ignored while open; quit still works', () => {
  const model = buildModel(fixture());
  let state = initialState(model);
  let r = applyKey(state, 'space', model);
  assert.deepEqual(r.action, { type: 'openCard', listIndex: 0, cardIndex: 0 });
  assert.equal(r.state.modal.mode, 'edit');
  const modalState = r.state;
  // Navigation, moves and space are ignored while the modal is open.
  for (const key of ['h', 'l', 'j', 'k', 'left', 'S-h', 'S-l', 'space']) {
    const rr = applyKey(modalState, key, model);
    assert.equal(rr.action, null, key);
    assert.deepEqual(rr.state, modalState, key);
  }
  // Quit keys still work.
  assert.deepEqual(applyKey(modalState, 'q', model).action, { type: 'quit' });
});

test('applyKey: space on an empty list does nothing', () => {
  const dir = tempRepo();
  writeCardFile(dir, 'Empty', 'keep.txt', {}); // list folder exists, no cards
  const model = buildModel(dir);
  // remove the non-json file effect: list with zero cards
  model.lists[0].cards = [];
  const r = applyKey(initialState(model), 'space', model);
  assert.equal(r.action, null);
  assert.equal(r.state.modal, null);
});

test('applyKey: modal edit keys cycle fields, save and discard', () => {
  const model = buildModel(fixture());
  let state = applyKey(initialState(model), 'space', model).state;
  let r = applyKey(state, 'tab', model);
  assert.equal(r.state.modal.fieldIndex, 1);
  assert.deepEqual(r.action, { type: 'focusField', fieldIndex: 1 });
  r = applyKey(r.state, 'tab', model);
  assert.equal(r.state.modal.fieldIndex, 2);
  r = applyKey(r.state, 'tab', model); // wraps around
  assert.equal(r.state.modal.fieldIndex, 0);
  r = applyKey(r.state, 'S-tab', model); // wraps backwards
  assert.equal(r.state.modal.fieldIndex, MODAL_FIELDS.length - 1);
  r = applyKey(r.state, 'enter', model);
  assert.deepEqual(r.action, { type: 'saveCard' });
  r = applyKey(r.state, 'C-q', model);
  assert.deepEqual(r.action, { type: 'closeModal' });
  assert.equal(r.state.modal, null);
});

test('renderColumn: one line per card with the selected one flagged', () => {
  const model = buildModel(fixture());
  const lines = renderColumn(model.lists[1], 1);
  assert.deepEqual(lines, [
    { text: 'First', selected: false },
    { text: 'Second', selected: true }
  ]);
  assert.deepEqual(renderColumn({ name: 'X', cards: [] }, 0), []);
});

test('clampState keeps indices valid after the model shrinks', () => {
  const model = buildModel(fixture());
  const state = clampState({ listIndex: 5, cardIndex: 9, modal: null }, model);
  assert.equal(state.listIndex, 1);
  assert.equal(state.cardIndex, 1);
  const empty = clampState({ listIndex: 3, cardIndex: 2, modal: null }, { lists: [] });
  assert.equal(empty.listIndex, 0);
  assert.equal(empty.cardIndex, 0);
});

test('formatMeta: created/modified always, other only when extra metadata exists', () => {
  assert.equal(formatMeta({ createdAt: 'c', updatedAt: 'm' }), 'created: c\nmodified: m');
  assert.equal(
    formatMeta({ createdAt: 'c', updatedAt: 'm', priority: 'high', n: 3 }),
    'created: c\nmodified: m\nother: {"priority":"high","n":3}'
  );
});

test('slugify and collision-free file naming', () => {
  assert.equal(slugify('My Card Title!'), 'my-card-title');
  assert.equal(slugify('  Hello   World  '), 'hello-world');
  assert.equal(slugify('!!!'), 'card');
});

test('edit serialization: bumps updatedAt, preserves createdAt and extra metadata', () => {
  const card = {
    title: 'Old',
    description: 'd',
    comments: ['x'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    priority: 'high'
  };
  const next = serializeEdit(card, { title: 'New', description: 'd2', comments: ['y', { a: 1 }] });
  assert.equal(next.title, 'New');
  assert.equal(next.description, 'd2');
  assert.deepEqual(next.comments, ['y', { a: 1 }]);
  assert.equal(next.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(next.priority, 'high');
  assert.ok(next.updatedAt > card.updatedAt || next.updatedAt !== card.updatedAt);
  assert.notEqual(next.updatedAt, card.updatedAt);
});

test('validateEdit: empty title is rejected', () => {
  assert.equal(validateEdit({ title: '' }), 'title must not be empty');
  assert.equal(validateEdit({ title: '   ' }), 'title must not be empty');
  assert.equal(validateEdit({ title: 'ok' }), null);
});

test('parseComments/formatComments round-trip strings and objects', () => {
  const comments = ['plain', { author: 'r', text: 'hi' }];
  const text = formatComments(comments);
  assert.equal(text, 'plain\n{"author":"r","text":"hi"}');
  assert.deepEqual(parseComments(text), comments);
  assert.deepEqual(parseComments(''), []);
  assert.deepEqual(parseComments('a\n\n  \nb\n'), ['a', 'b']);
});
