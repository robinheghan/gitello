import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Create a fresh temp dir to use as GITELLO_PATH. */
export function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gitello-test-'));
}

/**
 * Run the gitello CLI in a child process with GITELLO_PATH pointed at `dir`.
 * Returns { status, stdout, stderr }.
 */
export function run(dir, args) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'bin/gitello.js'), ...args], {
    env: { ...process.env, GITELLO_PATH: dir },
    encoding: 'utf8'
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

/** Run git directly inside the data repo. */
export function git(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Write a card JSON file directly into a list folder (test fixture). */
export function writeCardFile(dir, list, fileName, card) {
  const listDir = path.join(dir, list);
  fs.mkdirSync(listDir, { recursive: true });
  fs.writeFileSync(path.join(listDir, fileName), JSON.stringify(card, null, 2) + '\n');
}
