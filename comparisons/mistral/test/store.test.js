import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git, run, tempRepo } from './helpers.js';
import { autoCommit, ensureRepo, gitLog, isClean, repoPath } from '../src/store.js';

test('repo is created on first use and is empty', () => {
  const dir = tempRepo();
  process.env.GITELLO_PATH = dir;
  const repo = ensureRepo();
  assert.equal(repo, path.resolve(dir));
  assert.ok(fs.existsSync(path.join(repo, '.git')));
  // Empty repo: no commits yet, clean status.
  assert.equal(git(repo, ['status', '--porcelain']).stdout, '');
  assert.notEqual(git(repo, ['rev-list', '--count', 'HEAD']).status, 0); // no commits yet
});

test('repo-local git identity fallback allows commits without global config', () => {
  const dir = tempRepo();
  // Simulate a machine with no global/system git config.
  process.env.GITELLO_PATH = dir;
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
  try {
    const repo = ensureRepo();
    // The fallback wrote a repo-local identity.
    assert.equal(
      git(repo, ['config', '--local', '--get', 'user.email']).stdout.trim(),
      'gitello@localhost'
    );
    assert.equal(git(repo, ['config', '--local', '--get', 'user.name']).stdout.trim(), 'gitello');
    fs.writeFileSync(path.join(repo, 'file.txt'), 'hello');
    autoCommit(path.join(repo, 'file.txt'), 'test commit');
    const log = git(repo, ['log', '--format=%an <%ae>']);
    assert.match(log.stdout, /gitello <gitello@localhost>/);
    assert.ok(isClean());
  } finally {
    delete process.env.GIT_CONFIG_GLOBAL;
    delete process.env.GIT_CONFIG_SYSTEM;
    delete process.env.GITELLO_PATH;
  }
});

test('autoCommit commits only its own paths as a single commit', () => {
  const dir = tempRepo();
  process.env.GITELLO_PATH = dir;
  const repo = ensureRepo();
  fs.mkdirSync(path.join(repo, 'a'));
  fs.writeFileSync(path.join(repo, 'a', 'one.txt'), '1');
  fs.writeFileSync(path.join(repo, 'other.txt'), 'untracked');
  autoCommit(path.join(repo, 'a', 'one.txt'), 'add one');
  // other.txt must remain untracked/unstaged.
  assert.match(git(repo, ['status', '--porcelain']).stdout, /\?\? other\.txt/);
  assert.deepEqual(gitLog(repo), ['add one']);
});

test('autoCommit spans several paths in one commit (move = delete + add)', () => {
  const dir = tempRepo();
  process.env.GITELLO_PATH = dir;
  const repo = ensureRepo();
  fs.mkdirSync(path.join(repo, 'x'));
  fs.mkdirSync(path.join(repo, 'y'));
  const from = path.join(repo, 'x', 'card.json');
  const to = path.join(repo, 'y', 'card.json');
  fs.writeFileSync(from, '{}');
  autoCommit(from, 'create card');
  fs.renameSync(from, to);
  autoCommit([from, to], 'move card');
  const messages = gitLog(repo);
  assert.equal(messages.length, 2);
  assert.equal(messages[0], 'move card');
  // The move commit touched both paths in a single commit.
  const files = git(repo, ['show', '--no-renames', '--name-status', '--format=', 'HEAD']).stdout;
  assert.match(files, /D\tx\/card\.json/);
  assert.match(files, /A\ty\/card\.json/);
  assert.ok(isClean());
});

test('git proxy passes through exit codes', () => {
  const dir = tempRepo();
  assert.equal(run(dir, ['git', 'status', '--porcelain']).status, 0);
  const bad = run(dir, ['git', '--definitely-not-a-flag']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown option|usage/i);
});

test('GITELLO_PATH overrides the default ~/.gitello location', () => {
  const dir = tempRepo();
  process.env.GITELLO_PATH = dir;
  assert.equal(repoPath(), path.resolve(dir));
  delete process.env.GITELLO_PATH;
  assert.match(repoPath(), /\.gitello$/);
});
