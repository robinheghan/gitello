import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as store from '../src/store.js';
import { isolatedRepo, tmpRepo, runGit, commitCount } from './helpers.js';

test('repository is created automatically on first use', () => {
  const repo = tmpRepo();
  assert.ok(!fs.existsSync(path.join(repo, '.git')));
  store.ensureRepo(repo);
  assert.ok(fs.existsSync(path.join(repo, '.git')));
});

test('a repo-local identity is configured when no global identity exists', () => {
  const repo = isolatedRepo();
  store.ensureRepo(repo);
  assert.equal(
    runGit(repo, ['config', '--local', '--get', 'user.name']).stdout.trim(),
    'gitello',
  );
  assert.equal(
    runGit(repo, ['config', '--local', '--get', 'user.email']).stdout.trim(),
    'gitello@localhost',
  );
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;
});

test('commit stages and commits only the given paths', () => {
  const repo = isolatedRepo();
  store.ensureRepo(repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
  store.commit(repo, ['a.txt'], 'Add a');
  assert.equal(store.lastMessage(repo), 'Add a');
  const statusBefore = runGit(repo, ['status', '--porcelain']).stdout;
  assert.ok(statusBefore.includes('b.txt'));
  store.commit(repo, ['b.txt'], 'Add b');
  assert.equal(store.lastMessage(repo), 'Add b');
  assert.equal(commitCount(repo), 2);
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;
});

test('git proxy passes the exit code through', () => {
  const repo = isolatedRepo();
  store.ensureRepo(repo);
  assert.equal(
    store.gitProxy(['rev-parse', 'HEAD'], { repo, stdio: 'ignore' }) !== 0,
    true,
  );
  fs.writeFileSync(path.join(repo, 'file.txt'), 'x\n');
  store.commit(repo, ['file.txt'], 'Add file');
  assert.equal(
    store.gitProxy(['rev-parse', 'HEAD'], { repo, stdio: 'ignore' }),
    0,
  );
  assert.equal(store.gitProxy(['status'], { repo, stdio: 'ignore' }), 0);
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_SYSTEM;
});
