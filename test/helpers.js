import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";

export function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitello-"));
  const repo = path.join(dir, "repo");
  process.env.GITELLO_PATH = repo;
  return { dir, repo };
}

export function cleanupRepo(dir) {
  delete process.env.GITELLO_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
}

export function runCli(args) {
  const out = [];
  const err = [];
  const code = main(args, {
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write: (chunk) => err.push(chunk) },
  });
  return { code, out: out.join(""), err: err.join("") };
}

export function gitLogSubjects(repo) {
  const result = spawnSync("git", ["-C", repo, "log", "--format=%s"], {
    encoding: "utf8",
  });
  return result.stdout.trim().split("\n").filter(Boolean);
}

export const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
