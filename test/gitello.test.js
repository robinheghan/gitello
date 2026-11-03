import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { main } from "../src/cli.js";

let dir;
let repo;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitello-"));
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

function gitLogSubjects() {
  const result = spawnSync("git", ["-C", repo, "log", "--format=%s"], {
    encoding: "utf8",
  });
  return result.stdout.trim().split("\n").filter(Boolean);
}

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

test("the first command creates an empty git repo", () => {
  const result = run(["lists"]);
  assert.equal(result.code, 0);
  assert.equal(result.out, "");
  assert.ok(fs.existsSync(path.join(repo, ".git")));
  const count = spawnSync("git", ["-C", repo, "rev-list", "--count", "HEAD"], {
    encoding: "utf8",
  });
  assert.notEqual(count.status, 0);
});

test("lists create adds a .gitkeep and commits, lists prints names alphabetically", () => {
  assert.equal(run(["lists", "create", "todo"]).code, 0);
  assert.ok(fs.existsSync(path.join(repo, "todo", ".gitkeep")));
  assert.ok(gitLogSubjects().includes('Create list "todo"'));
  run(["lists", "create", "alpha"]);
  const result = run(["lists"]);
  assert.equal(result.out, "alpha\ntodo\n");
});

test("lists create rejects duplicates and invalid names", () => {
  run(["lists", "create", "todo"]);
  const duplicate = run(["lists", "create", "todo"]);
  assert.equal(duplicate.code, 1);
  assert.match(duplicate.err, /already exists/);
  for (const name of ["a/b", ".", "..", ".hidden", "-x", ""]) {
    const result = run(["lists", "create", name]);
    assert.equal(
      result.code,
      1,
      `expected failure for ${JSON.stringify(name)}`,
    );
    assert.match(result.err, /invalid list name/);
  }
});

test("lists remove deletes the folder and commits", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const result = run(["lists", "remove", "todo"]);
  assert.equal(result.code, 0);
  assert.equal(result.out, 'Removed list "todo"\n');
  assert.ok(!fs.existsSync(path.join(repo, "todo")));
  assert.ok(gitLogSubjects().includes('Remove list "todo"'));
  assert.equal(run(["lists"]).out, "");
  const missing = run(["lists", "remove", "todo"]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /list not found/);
});

test("cards create stores a card json and commits", () => {
  run(["lists", "create", "todo"]);
  const result = run(["cards", "todo", "create", "Fix the Login Bug!"]);
  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    'Created card "Fix the Login Bug!" in list "todo"\n',
  );
  const file = path.join(repo, "todo", "fix-the-login-bug.json");
  assert.ok(fs.existsSync(file));
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(card.title, "Fix the Login Bug!");
  assert.equal(card.description, "");
  assert.deepEqual(card.comments, []);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assert.match(card.createdAt, iso);
  assert.match(card.updatedAt, iso);
  assert.equal(card.createdAt, card.updatedAt);
  assert.ok(
    gitLogSubjects().includes(
      'Create card "Fix the Login Bug!" in list "todo"',
    ),
  );
});

test("cards <list> prints titles in creation order", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Second"]);
  sleep(2);
  run(["cards", "todo", "create", "First"]);
  assert.equal(run(["cards", "todo"]).out, "Second\nFirst\n");
});

test("cards prints the ten most recent cards, --all prints everything", () => {
  run(["lists", "create", "todo"]);
  for (let i = 1; i <= 12; i += 1) {
    sleep(2);
    run(["cards", "todo", "create", `Card ${i}`]);
  }
  const recent = run(["cards"]);
  assert.equal(recent.out.trim().split("\n").length, 10);
  assert.ok(recent.out.startsWith("Card 12\n"));
  assert.ok(
    !recent.out.includes("Card 1\n") && !recent.out.includes("Card 2\n"),
  );
  const all = run(["cards", "--all"]);
  assert.equal(all.out.trim().split("\n").length, 12);
  assert.ok(all.out.startsWith("Card 12\n"));
  assert.ok(all.out.includes("Card 1\n"));
});

test("cards combines cards from all lists", () => {
  run(["lists", "create", "a"]);
  run(["lists", "create", "b"]);
  run(["cards", "a", "create", "In a"]);
  sleep(2);
  run(["cards", "b", "create", "In b"]);
  assert.equal(run(["cards"]).out, "In b\nIn a\n");
});

test("cards create requires a single quoted title", () => {
  run(["lists", "create", "todo"]);
  const result = run(["cards", "todo", "create", "Fix", "bug"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /quote multi-word values/);
});

test("cards commands fail when the list does not exist", () => {
  assert.equal(run(["cards", "nope"]).code, 1);
  assert.match(run(["cards", "nope"]).err, /list not found/);
  assert.match(run(["cards", "nope", "create", "X"]).err, /list not found/);
  assert.match(run(["cards", "nope", "remove", "X"]).err, /list not found/);
});

test("duplicate card titles get unique filenames", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  run(["cards", "todo", "create", "Fix bug"]);
  assert.ok(fs.existsSync(path.join(repo, "todo", "fix-bug.json")));
  assert.ok(fs.existsSync(path.join(repo, "todo", "fix-bug-2.json")));
  assert.equal(run(["cards", "todo"]).out, "Fix bug\nFix bug\n");
});

test("cards remove deletes the card and commits", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const result = run(["cards", "todo", "remove", "Fix bug"]);
  assert.equal(result.code, 0);
  assert.equal(result.out, 'Removed card "Fix bug" from list "todo"\n');
  assert.ok(!fs.existsSync(path.join(repo, "todo", "fix-bug.json")));
  assert.ok(
    gitLogSubjects().includes('Remove card "Fix bug" from list "todo"'),
  );
  assert.equal(run(["cards", "todo"]).out, "");
  const missing = run(["cards", "todo", "remove", "Fix bug"]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /card not found/);
});

test("git proxies git commands into the repo", () => {
  run(["lists", "create", "todo"]);
  const log = run(["git", "log", "--format=%s"]);
  assert.equal(log.code, 0);
  assert.ok(log.out.includes('Create list "todo"'));
  const status = run(["git", "status", "--porcelain"]);
  assert.equal(status.code, 0);
  assert.equal(status.out, "");
  assert.equal(run(["git"]).code, 1);
});

test("unknown or missing commands print usage and fail", () => {
  const bogus = run(["bogus"]);
  assert.equal(bogus.code, 1);
  assert.match(bogus.err, /Usage:/);
  const empty = run([]);
  assert.equal(empty.code, 1);
  assert.match(empty.err, /Usage:/);
});
