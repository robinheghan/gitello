import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Location of the gitello repository. Can be overridden with GITELLO_PATH.
export function repoPath() {
  if (process.env.GITELLO_PATH) {
    return process.env.GITELLO_PATH;
  }
  return path.join(os.homedir(), '.gitello');
}

// Run git in the given repository and return the complete spawn result.
export function runGit(repo, args, options = {}) {
  return spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function gitOk(repo, args) {
  const result = runGit(repo, args);
  return result.status === 0 && String(result.stdout).trim() !== '';
}

export function isRepo(repo) {
  return fs.existsSync(path.join(repo, '.git'));
}

// A git identity is needed for commits even when the user has none, so
// fall back to a repo-local identity when nothing else is configured.
function ensureIdentity(repo) {
  for (const [key, value] of [
    ['user.name', 'gitello'],
    ['user.email', 'gitello@localhost'],
  ]) {
    if (!gitOk(repo, ['config', '--get', key])) {
      runGit(repo, ['config', key, value]);
    }
  }
}

// Create the repository on first use (a plain, empty git repo) and make
// sure a usable identity is configured.
export function ensureRepo(repo = repoPath()) {
  fs.mkdirSync(repo, { recursive: true });
  if (!isRepo(repo)) {
    const result = runGit(repo, ['init']);
    if (result.status !== 0) {
      throw new Error(`git init failed: ${result.stderr}`);
    }
  }
  ensureIdentity(repo);
  return repo;
}

// Stage exactly the given paths and commit only those paths.
export function commit(repo, paths, message) {
  const add = runGit(repo, ['add', '--', ...paths]);
  if (add.status !== 0) {
    throw new Error(`git add failed: ${add.stderr}`);
  }
  const result = runGit(repo, ['commit', '-m', message, '--', ...paths]);
  if (result.status !== 0) {
    throw new Error(`git commit failed: ${result.stderr}`);
  }
  return result.stdout;
}

export function lastMessage(repo) {
  const result = runGit(repo, ['log', '-1', '--pretty=%s']);
  return result.status === 0 ? String(result.stdout).trim() : null;
}

// Run an arbitrary git command in the gitello repository, passing its
// exit code through.
export function gitProxy(args, { repo = repoPath(), stdio = 'inherit' } = {}) {
  const result = spawnSync('git', ['-C', repo, ...args], { stdio });
  return result.status === null ? 1 : result.status;
}
