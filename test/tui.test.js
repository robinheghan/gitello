import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { main } from "../src/cli.js";
import {
  applyKey,
  buildModel,
  initialState,
  performMove,
  renderColumn,
  truncate,
} from "../src/tui.js";

let dir;
let repo;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitello-tui-"));
  repo = path.join(dir, "repo");
  process.env.GITELLO_PATH = repo;
});

afterEach(() => {
  delete process.env.GITELLO_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

function run(args) {
  const out = [];
  const err = [];
  const code = main(args, {
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write: (chunk) => err.push(chunk) },
  });
  return { code, out: out.join(""), err: err.join("") };
}

const model = {
  lists: [
    { name: "todo", cards: [{ title: "First" }, { title: "Second" }] },
    { name: "empty", cards: [] },
    { name: "done", cards: [{ title: "Only" }] },
  ],
};

test("buildModel reads lists alphabetically with cards in creation order", () => {
  run(["lists", "create", "todo"]);
  run(["lists", "create", "done"]);
  run(["cards", "todo", "create", "Fix bug"]);
  run(["cards", "todo", "create", "Write docs"]);
  run(["cards", "done", "create", "Shipped"]);
  const built = buildModel(repo);
  assert.deepEqual(
    built.lists.map((list) => [
      list.name,
      list.cards.map((card) => card.title),
    ]),
    [
      ["done", ["Shipped"]],
      ["todo", ["Fix bug", "Write docs"]],
    ],
  );
});

test("j/k and down/up move between cards, clamped at both ends", () => {
  let state = initialState();
  assert.deepEqual(state, { list: 0, card: 0 });
  state = applyKey(model, state, "j").state;
  assert.deepEqual(state, { list: 0, card: 1 });
  assert.deepEqual(applyKey(model, state, "down").state, { list: 0, card: 1 });
  assert.deepEqual(applyKey(model, state, "k").state, { list: 0, card: 0 });
  assert.deepEqual(applyKey(model, state, "up").state, { list: 0, card: 0 });
});

test("h/l and left/right move between lists, clamped at both ends", () => {
  let state = initialState();
  assert.deepEqual(applyKey(model, state, "left").state, { list: 0, card: 0 });
  state = applyKey(model, state, "l").state;
  assert.deepEqual(state, { list: 1, card: 0 });
  state = applyKey(model, state, "right").state;
  assert.deepEqual(state, { list: 2, card: 0 });
  assert.deepEqual(applyKey(model, state, "l").state, { list: 2, card: 0 });
  state = applyKey(model, state, "h").state;
  assert.deepEqual(state, { list: 1, card: 0 });
  state = applyKey(model, state, "left").state;
  assert.deepEqual(state, { list: 0, card: 0 });
});

test("moving to a list clamps the card index to that list's cards", () => {
  const many = {
    lists: [
      { name: "a", cards: [{ title: "1" }, { title: "2" }, { title: "3" }] },
      { name: "b", cards: [{ title: "x" }] },
    ],
  };
  const state = { list: 0, card: 2 };
  assert.deepEqual(applyKey(many, state, "l").state, { list: 1, card: 0 });
  assert.deepEqual(applyKey(many, { list: 0, card: 2 }, "h").state, {
    list: 0,
    card: 2,
  });
});

test("navigation works on an empty board", () => {
  const empty = { lists: [] };
  const state = initialState();
  for (const key of ["j", "k", "h", "l", "up", "down", "left", "right"]) {
    assert.deepEqual(applyKey(empty, state, key).state, { list: 0, card: 0 });
  }
});

test("q, escape and ctrl-c quit; unrelated keys are ignored", () => {
  const state = initialState();
  for (const key of ["q", "escape", "C-c"]) {
    const result = applyKey(model, state, key);
    assert.equal(result.quit, true, key);
    assert.deepEqual(result.state, state);
  }
  const ignored = applyKey(model, state, "x");
  assert.equal(ignored.quit, false);
  assert.deepEqual(ignored.state, state);
});

test("shift+h/l and shift+arrows move the selected card to the adjacent list", () => {
  let result = applyKey(model, { list: 0, card: 0 }, "S-l");
  assert.deepEqual(result.state, { list: 1, card: 0 });
  assert.equal(result.quit, false);
  assert.deepEqual(result.move, { from: "todo", to: "empty", card: 0 });
  result = applyKey(model, { list: 0, card: 1 }, "S-right");
  assert.deepEqual(result.state, { list: 1, card: 0 });
  assert.deepEqual(result.move, { from: "todo", to: "empty", card: 1 });
  result = applyKey(model, { list: 2, card: 0 }, "S-h");
  assert.deepEqual(result.state, { list: 1, card: 0 });
  assert.deepEqual(result.move, { from: "done", to: "empty", card: 0 });
  result = applyKey(model, { list: 2, card: 0 }, "S-left");
  assert.deepEqual(result.state, { list: 1, card: 0 });
  assert.deepEqual(result.move, { from: "done", to: "empty", card: 0 });
});

test("shift+move at the edge or from an empty list does not move a card", () => {
  let result = applyKey(model, { list: 0, card: 0 }, "S-left");
  assert.deepEqual(result.state, { list: 0, card: 0 });
  assert.equal(result.move, undefined);
  result = applyKey(model, { list: 2, card: 0 }, "S-right");
  assert.deepEqual(result.state, { list: 2, card: 0 });
  assert.equal(result.move, undefined);
  result = applyKey(model, { list: 1, card: 0 }, "S-l");
  assert.deepEqual(result.state, { list: 2, card: 0 });
  assert.equal(result.move, undefined);
});

test("shift+up/down cannot move a card within a list", () => {
  const state = { list: 0, card: 0 };
  for (const key of ["S-j", "S-k", "S-up", "S-down"]) {
    const result = applyKey(model, state, key);
    assert.deepEqual(result.state, state, key);
    assert.equal(result.move, undefined, key);
    assert.equal(result.quit, false, key);
  }
});

test("performMove moves the card file, commits, and rebuilds the model", () => {
  run(["lists", "create", "done"]);
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  run(["cards", "todo", "create", "Write docs"]);
  const built = buildModel(repo);
  const result = applyKey(built, { list: 1, card: 0 }, "S-h");
  assert.deepEqual(result.move, { from: "todo", to: "done", card: 0 });
  const moved = performMove(repo, built, result.move);
  assert.equal(moved.title, "Fix bug");
  assert.ok(!fs.existsSync(path.join(repo, "todo", "fix-bug.json")));
  assert.ok(fs.existsSync(path.join(repo, "done", "fix-bug.json")));
  assert.deepEqual(
    built.lists.map((list) => [
      list.name,
      list.cards.map((card) => card.title),
    ]),
    [
      ["done", ["Fix bug"]],
      ["todo", ["Write docs"]],
    ],
  );
  const log = run(["git", "log", "--format=%s"]);
  assert.ok(
    log.out.includes('Move card "Fix bug" from list "todo" to list "done"'),
  );
});

test("space toggles the card modal without changing the selection", () => {
  const state = { list: 0, card: 1 };
  const result = applyKey(model, state, "space");
  assert.equal(result.quit, false);
  assert.equal(result.toggleCard, true);
  assert.deepEqual(result.state, state);
  assert.equal(applyKey(model, state, "x").toggleCard, undefined);
  assert.equal(applyKey(model, state, "j").toggleCard, undefined);
});

test("renderColumn highlights only the selected card of the active list", () => {
  const column = model.lists[0];
  const active = renderColumn(column, {
    active: true,
    selectedCard: 1,
    width: 20,
  });
  const lines = active.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(!lines[0].includes("{inverse}"));
  assert.match(lines[1], /^\{inverse\} Second +\{\/inverse\}$/);
  const inactive = renderColumn(column, {
    active: false,
    selectedCard: 1,
    width: 20,
  });
  assert.ok(!inactive.includes("{inverse}"));
});

test("renderColumn shows a placeholder for empty lists", () => {
  const rendered = renderColumn(model.lists[1], {
    active: true,
    selectedCard: 0,
    width: 20,
  });
  assert.match(rendered, /\(empty\)/);
});

test("renderColumn truncates titles that are too wide for the column", () => {
  const column = { name: "todo", cards: [{ title: "x".repeat(50) }] };
  const rendered = renderColumn(column, {
    active: false,
    selectedCard: 0,
    width: 10,
  });
  assert.equal(rendered.length, 8);
  assert.ok(rendered.endsWith("…"));
  assert.equal(truncate("short", 10), "short");
  assert.equal(truncate("", 0), "");
});

test("bare gitello without a TTY still prints usage and fails", () => {
  const result = run([]);
  assert.equal(result.code, 1);
  assert.match(result.err, /Usage:/);
  assert.match(result.err, /interactive board/);
});
