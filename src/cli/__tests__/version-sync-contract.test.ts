import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { version } from '../version.js';

test('package.json version stays aligned with the exported CLI version and catalog manifest', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
  const manifest = JSON.parse(await fs.readFile(path.join(process.cwd(), 'src', 'catalog', 'manifest.json'), 'utf8')) as { catalogVersion: string };
  assert.equal(version, pkg.version);
  assert.equal(manifest.catalogVersion, pkg.version);
});
