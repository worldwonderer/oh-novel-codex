import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { getPackageRoot, getPackageVersion, readPackageMetadata } from '../package.js';

test('getPackageRoot returns a directory that contains package.json', () => {
  const root = getPackageRoot();
  assert.ok(existsSync(join(root, 'package.json')), `Expected package.json in ${root}`);
});

test('getPackageRoot returns an absolute stable path', () => {
  const first = getPackageRoot();
  const second = getPackageRoot();
  assert.ok(first.startsWith('/'), `Expected absolute path, got: ${first}`);
  assert.equal(first, second);
});

test('readPackageMetadata returns package name and version', () => {
  const metadata = readPackageMetadata();
  assert.equal(metadata.name, 'oh-novel-codex');
  assert.match(metadata.version, /^\d+\.\d+\.\d+$/);
});

test('getPackageVersion matches package metadata version', () => {
  assert.equal(getPackageVersion(), readPackageMetadata().version);
});
