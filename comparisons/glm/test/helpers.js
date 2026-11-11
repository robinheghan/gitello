import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A fresh repository path per test, isolated from the real home repo.
export function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitello-test-'));
  const repo = path.join(root, '.gitello');
  process.env.GITELLO_PATH = repo;
  return repo;
}

// A fresh repository with git identity fallbacks forced, so tests do
// not depend on the host git configuration.
export function isolatedRepo() {
  const repo = tmpRepo();
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
  return repo;
}

export function runGit(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
  });
  return result;
}

export function commitCount(repo) {
  return Number(runGit(repo, ['rev-list', '--count', 'HEAD']).stdout.trim());
}

export function makeIo(tty = false) {
  const stream = () => {
    const chunks = [];
    return {
      write(text) {
        chunks.push(String(text));
      },
      toString() {
        return chunks.join('');
      },
    };
  };
  return { stdout: stream(), stderr: stream(), tty, gitStdio: 'ignore' };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
