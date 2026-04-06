import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readProjectMemory, writeProjectMemory } from '../project-memory.js';

test('project memory writes and merges JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-memory-'));
  await writeProjectMemory(root, { style: { tone: 'mobile-first' } });
  await writeProjectMemory(root, { style: { pacing: 'fast' } }, { merge: true });
  const memory = await readProjectMemory(root);
  assert.deepEqual(memory, { style: { tone: 'mobile-first', pacing: 'fast' } });
});
