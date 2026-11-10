import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the path of the git repo that holds all gitello data.
 * Can be overridden with the GITELLO_PATH environment variable.
 */
export function repoPath() {
  const p = process.env.GITELLO_PATH || path.join(os.homedir(), '.gitello');
  return path.resolve(p);
}

/**
 * Run a git command inside the data repo, capturing output.
 */
export function runGit(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * Make sure the data repo exists. On first use the repo is created empty,
 * with a repo-local git identity fallback so commits work even without a
 * global git config.
 */
export function ensureRepo() {
  const dir = repoPath();
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(dir, { recursive: true });
    const init = runGit(dir, ['init', '-q']);
    if (init.status !== 0) {
      throw new Error(`failed to initialize git repo at ${dir}: ${init.stderr.trim()}`);
    }
    // Repo-local identity fallback (only when no identity is configured anywhere).
    if (runGit(dir, ['config', '--get', 'user.email']).status !== 0) {
      runGit(dir, ['config', 'user.email', 'gitello@localhost']);
    }
    if (runGit(dir, ['config', '--get', 'user.name']).status !== 0) {
      runGit(dir, ['config', 'user.name', 'gitello']);
    }
  }
  return dir;
}

/**
 * Auto-commit only the given path(s) (absolute or relative to the repo).
 * A change spanning several paths (e.g. a move = delete + add) is committed
 * as a single commit.
 */
export function autoCommit(paths, message) {
  const dir = ensureRepo();
  const rel = (Array.isArray(paths) ? paths : [paths]).map((p) => path.relative(dir, p));
  const status = runGit(dir, ['status', '--porcelain', '--', ...rel]);
  if (status.status !== 0) throw new Error(status.stderr.trim());
  if (!status.stdout.trim()) return; // nothing to commit
  const add = runGit(dir, ['add', '--', ...rel]);
  if (add.status !== 0) throw new Error(add.stderr.trim());
  const commit = runGit(dir, ['commit', '-q', '-m', message, '--', ...rel]);
  if (commit.status !== 0) throw new Error(commit.stderr.trim());
}

/**
 * Proxy a git command into the data repo, inheriting stdio.
 * Returns the git exit code so it can be passed through.
 */
export function gitProxy(args) {
  const dir = ensureRepo();
  const res = spawnSync('git', args, { cwd: dir, stdio: 'inherit' });
  if (res.error) throw res.error;
  return res.status === null ? 1 : res.status;
}

/**
 * True when the data repo has no uncommitted changes.
 */
export function isClean() {
  const dir = ensureRepo();
  return runGit(dir, ['status', '--porcelain']).stdout.trim() === '';
}

/**
 * Commit messages / log helpers used by tests and commands.
 */
export function gitLog(dir, args = ['--format=%s']) {
  return runGit(dir, ['log', ...args])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
}
