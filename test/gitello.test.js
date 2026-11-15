import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  byRecency,
  formatCard,
  formatComments,
  formatMeta,
  parseComments,
  slugify,
  updateCard,
} from "../src/cards.js";
import { repoPath } from "../src/store.js";
import {
  cleanupRepo,
  freshRepo,
  gitLogSubjects,
  runCli as run,
  sleep,
} from "./helpers.js";

let dir;
let repo;

beforeEach(() => {
  ({ dir, repo } = freshRepo());
});

afterEach(() => {
  cleanupRepo(dir);
});

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
  assert.ok(gitLogSubjects(repo).includes('Create list "todo"'));
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

test("lists create fails when the name is taken by a plain file", () => {
  run(["lists", "create", "todo"]);
  fs.writeFileSync(path.join(repo, "blocked"), "");
  const result = run(["lists", "create", "blocked"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /cannot create list: blocked/);
});

test("lists remove deletes the folder and commits", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const result = run(["lists", "remove", "todo"]);
  assert.equal(result.code, 0);
  assert.equal(result.out, 'Removed list "todo"\n');
  assert.ok(!fs.existsSync(path.join(repo, "todo")));
  assert.ok(gitLogSubjects(repo).includes('Remove list "todo"'));
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
    gitLogSubjects(repo).includes(
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

test("cards create rejects an empty title", () => {
  run(["lists", "create", "todo"]);
  const result = run(["cards", "todo", "create", ""]);
  assert.equal(result.code, 1);
  assert.match(result.err, /card title must not be empty/);
});

test("cards commands fail when the list does not exist", () => {
  for (const args of [
    ["cards", "nope"],
    ["cards", "nope", "create", "X"],
    ["cards", "nope", "remove", "X"],
  ]) {
    const result = run(args);
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.match(result.err, /list not found/, JSON.stringify(args));
  }
});

test("a broken card file fails every card read with invalid card file", () => {
  run(["lists", "create", "todo"]);
  fs.writeFileSync(path.join(repo, "todo", "broken.json"), "{nope");
  for (const args of [
    ["cards", "todo"],
    ["cards"],
    ["cards", "show", "anything"],
  ]) {
    const result = run(args);
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.match(result.err, /invalid card file/, JSON.stringify(args));
  }
});

test("cards show prints title, description, timestamps, other metadata, and comments", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const file = path.join(repo, "todo", "fix-bug.json");
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  card.description = "It crashes on the login page";
  card.comments = ["looked at it", { author: "me", text: "still broken" }];
  card.priority = "high";
  card.createdAt = "2026-01-01T10:00:00.000Z";
  card.updatedAt = "2026-01-02T11:30:00.000Z";
  fs.writeFileSync(file, JSON.stringify(card, null, 2) + "\n");
  const result = run(["cards", "show", "Fix bug"]);
  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    'Fix bug\n\nIt crashes on the login page\n\ncreated: 2026-01-01T10:00:00.000Z\nmodified: 2026-01-02T11:30:00.000Z\nother: {"priority":"high"}\n\nlooked at it\n{"author":"me","text":"still broken"}\n',
  );
});

test("cards show omits the other line for a freshly created card", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const card = JSON.parse(
    fs.readFileSync(path.join(repo, "todo", "fix-bug.json"), "utf8"),
  );
  const result = run(["cards", "show", "Fix bug"]);
  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    `Fix bug\n\n\n\ncreated: ${card.createdAt}\nmodified: ${card.updatedAt}\n\n`,
  );
});

test("cards show finds cards in any list and fails when the title is missing", () => {
  run(["lists", "create", "todo"]);
  run(["lists", "create", "done"]);
  run(["cards", "done", "create", "Ship it"]);
  const found = run(["cards", "show", "Ship it"]);
  assert.equal(found.code, 0);
  assert.match(found.out, /^Ship it\n/);
  const missing = run(["cards", "show", "Nope"]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /card not found: Nope/);
});

test("cards show prints every duplicate title, most recent first", () => {
  run(["lists", "create", "a"]);
  run(["lists", "create", "b"]);
  run(["cards", "a", "create", "Fix bug"]);
  sleep(2);
  run(["cards", "b", "create", "Fix bug"]);
  const result = run(["cards", "show", "Fix bug"]);
  assert.equal(result.code, 0);
  assert.equal(result.out.match(/^Fix bug$/gm).length, 2);
  const cardA = JSON.parse(
    fs.readFileSync(path.join(repo, "a", "fix-bug.json"), "utf8"),
  );
  const cardB = JSON.parse(
    fs.readFileSync(path.join(repo, "b", "fix-bug.json"), "utf8"),
  );
  assert.ok(
    result.out.indexOf(cardB.createdAt) < result.out.indexOf(cardA.createdAt),
  );
});

test("cards show requires a single quoted title", () => {
  run(["lists", "create", "todo"]);
  const result = run(["cards", "show", "Fix", "bug"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /quote multi-word values/);
  assert.equal(run(["cards", "show"]).code, 1);
});

test("formatCard renders all card fields and tolerates missing ones", () => {
  const card = {
    title: "T",
    description: "D",
    comments: ["c1", { n: 2 }],
    createdAt: "c",
    updatedAt: "u",
    list: "todo",
    file: "t.json",
    extra: "e",
  };
  assert.equal(
    formatCard(card),
    'T\n\nD\n\ncreated: c\nmodified: u\nother: {"extra":"e"}\n\nc1\n{"n":2}',
  );
  assert.equal(formatCard({}), "\n\n\n\ncreated: \nmodified: \n");
});

test("formatMeta joins created, modified, and other metadata", () => {
  assert.equal(
    formatMeta({ createdAt: "c", updatedAt: "u" }),
    "created: c · modified: u",
  );
  assert.equal(
    formatMeta({
      createdAt: "c",
      updatedAt: "u",
      extra: 1,
      list: "x",
      file: "f",
    }),
    'created: c · modified: u · other: {"extra":1}',
  );
});

test("formatComments and parseComments round-trip string and object comments", () => {
  const comments = ["first", { n: 2 }, "third"];
  const text = formatComments(comments);
  assert.equal(text, 'first\n{"n":2}\nthird');
  assert.deepEqual(parseComments(text), comments);
  assert.equal(formatComments(undefined), "");
  assert.deepEqual(parseComments(""), []);
  assert.deepEqual(parseComments("a\n\n   \nb"), ["a", "b"]);
  assert.deepEqual(parseComments('{"n":2}\nnot json {'), [
    { n: 2 },
    "not json {",
  ]);
  assert.deepEqual(parseComments("{nope\n[1,"), ["{nope", "[1,"]);
});

test("slugify turns titles into file-safe slugs", () => {
  assert.equal(slugify("Fix the Login Bug!"), "fix-the-login-bug");
  assert.equal(slugify("Café crème"), "cafe-creme");
  assert.equal(slugify("Äpfel & Birnen"), "apfel-birnen");
  assert.equal(slugify("!!!"), "card");
  assert.equal(slugify("---"), "card");
  assert.equal(slugify("a".repeat(80)), "a".repeat(60));
  assert.equal(slugify(`${"a".repeat(59)}-${"b".repeat(10)}`), "a".repeat(59));
});

test("byRecency breaks timestamp ties by createdAt, then list, then file", () => {
  const cards = [
    { title: "a", updatedAt: "t", createdAt: "c1", list: "b", file: "z.json" },
    { title: "b", updatedAt: "t", createdAt: "c2", list: "a", file: "y.json" },
    { title: "c", updatedAt: "t", createdAt: "c2", list: "a", file: "x.json" },
    { title: "p", updatedAt: "t", createdAt: "c2", list: "b", file: "a.json" },
    { title: "d", updatedAt: "t2" },
  ];
  assert.deepEqual(
    byRecency(cards).map((card) => card.title),
    ["d", "c", "b", "p", "a"],
  );
});

test("updateCard rewrites title, description, and comments and bumps updatedAt", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const file = path.join(repo, "todo", "fix-bug.json");
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  sleep(10);
  const updated = updateCard(repo, "todo", "fix-bug.json", {
    title: "Fix the bug",
    description: "details",
    comments: ["note"],
  });
  assert.equal(updated.title, "Fix the bug");
  assert.equal(updated.description, "details");
  assert.deepEqual(updated.comments, ["note"]);
  assert.equal(updated.createdAt, before.createdAt);
  assert.ok(updated.updatedAt > before.updatedAt);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(stored, updated);
  assert.ok(!("list" in stored));
  assert.ok(!("file" in stored));
  const partial = updateCard(repo, "todo", "fix-bug.json", {
    description: "more",
  });
  assert.equal(partial.title, "Fix the bug");
  assert.equal(partial.description, "more");
  assert.deepEqual(partial.comments, ["note"]);
});

test("updateCard rejects an empty title and invalid card files", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  assert.throws(
    () => updateCard(repo, "todo", "fix-bug.json", { title: "   " }),
    /card title must not be empty/,
  );
  fs.writeFileSync(path.join(repo, "todo", "broken.json"), "{nope");
  assert.throws(
    () => updateCard(repo, "todo", "broken.json", { title: "x" }),
    /invalid card file/,
  );
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
    gitLogSubjects(repo).includes('Remove card "Fix bug" from list "todo"'),
  );
  assert.equal(run(["cards", "todo"]).out, "");
  const missing = run(["cards", "todo", "remove", "Fix bug"]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /card not found/);
});

test("cards remove deletes every card with a duplicate title", () => {
  run(["lists", "create", "todo"]);
  run(["cards", "todo", "create", "Fix bug"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const result = run(["cards", "todo", "remove", "Fix bug"]);
  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    'Removed card "Fix bug" from list "todo"\n'.repeat(2),
  );
  assert.ok(!fs.existsSync(path.join(repo, "todo", "fix-bug.json")));
  assert.ok(!fs.existsSync(path.join(repo, "todo", "fix-bug-2.json")));
  assert.equal(run(["cards", "todo"]).out, "");
});

test("cards move moves the card to another list and commits", () => {
  run(["lists", "create", "todo"]);
  run(["lists", "create", "done"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const result = run(["cards", "todo", "move", "Fix bug", "done"]);
  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    'Moved card "Fix bug" from list "todo" to list "done"\n',
  );
  assert.ok(!fs.existsSync(path.join(repo, "todo", "fix-bug.json")));
  const file = path.join(repo, "done", "fix-bug.json");
  assert.ok(fs.existsSync(file));
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(card.title, "Fix bug");
  assert.equal(run(["cards", "todo"]).out, "");
  assert.equal(run(["cards", "done"]).out, "Fix bug\n");
  assert.ok(
    gitLogSubjects(repo).includes(
      'Move card "Fix bug" from list "todo" to list "done"',
    ),
  );
});

test("cards move moves every card with a duplicate title", () => {
  run(["lists", "create", "todo"]);
  run(["lists", "create", "done"]);
  run(["cards", "todo", "create", "Fix bug"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const result = run(["cards", "todo", "move", "Fix bug", "done"]);
  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    'Moved card "Fix bug" from list "todo" to list "done"\n'.repeat(2),
  );
  assert.equal(run(["cards", "todo"]).out, "");
  assert.equal(run(["cards", "done"]).out, "Fix bug\nFix bug\n");
  assert.ok(fs.existsSync(path.join(repo, "done", "fix-bug.json")));
  assert.ok(fs.existsSync(path.join(repo, "done", "fix-bug-2.json")));
});

test("cards move picks a fresh filename when the target list has a collision", () => {
  run(["lists", "create", "todo"]);
  run(["lists", "create", "done"]);
  run(["cards", "done", "create", "Fix bug"]);
  run(["cards", "todo", "create", "Fix bug"]);
  assert.equal(run(["cards", "todo", "move", "Fix bug", "done"]).code, 0);
  assert.ok(fs.existsSync(path.join(repo, "done", "fix-bug.json")));
  assert.ok(fs.existsSync(path.join(repo, "done", "fix-bug-2.json")));
  assert.equal(run(["cards", "todo"]).out, "");
  assert.equal(run(["cards", "done"]).out, "Fix bug\nFix bug\n");
});

test("cards move validates lists, card, and arguments", () => {
  run(["lists", "create", "todo"]);
  run(["lists", "create", "done"]);
  run(["cards", "todo", "create", "Fix bug"]);
  const fromMissing = run(["cards", "nope", "move", "Fix bug", "done"]);
  assert.equal(fromMissing.code, 1);
  assert.match(fromMissing.err, /list not found: nope/);
  const toMissing = run(["cards", "todo", "move", "Fix bug", "nope"]);
  assert.equal(toMissing.code, 1);
  assert.match(toMissing.err, /list not found: nope/);
  const cardMissing = run(["cards", "todo", "move", "Missing", "done"]);
  assert.equal(cardMissing.code, 1);
  assert.match(cardMissing.err, /card not found/);
  const same = run(["cards", "todo", "move", "Fix bug", "todo"]);
  assert.equal(same.code, 1);
  assert.match(same.err, /same list/);
  const args = run(["cards", "todo", "move", "Fix bug"]);
  assert.equal(args.code, 1);
  assert.match(args.err, /expects two arguments/);
  assert.ok(fs.existsSync(path.join(repo, "todo", "fix-bug.json")));
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

test("malformed subcommands print usage and fail", () => {
  for (const args of [
    ["lists", "create"],
    ["lists", "create", "a", "b"],
    ["lists", "remove"],
    ["lists", "bogus"],
    ["cards", "--all", "extra"],
    ["cards", "todo", "bogus"],
  ]) {
    const result = run(args);
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.match(result.err, /Usage:/, JSON.stringify(args));
  }
});

test("git proxies git command failures with their exit code and stderr", () => {
  run(["lists"]);
  const result = run(["git", "log"]);
  assert.equal(result.code, 128);
  assert.match(result.err, /fatal:/);
});

test("a failing git commit is reported as a gitello error", () => {
  run(["lists", "create", "todo"]);
  assert.equal(run(["git", "config", "commit.gpgsign", "true"]).code, 0);
  assert.equal(run(["git", "config", "gpg.program", "/bin/false"]).code, 0);
  const result = run(["lists", "create", "done"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /git commit .* failed/);
});

test("repoPath defaults to ~/.gitello without GITELLO_PATH", () => {
  delete process.env.GITELLO_PATH;
  assert.equal(repoPath(), path.join(os.homedir(), ".gitello"));
});
