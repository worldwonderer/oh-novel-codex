import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSessionHistory } from '../store.js';
import { readSessionHistory, searchSessionHistory } from '../search.js';

test('session history appends and searches events', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-history-'));
  await appendSessionHistory({
    timestamp: '2026-01-01T00:00:00Z',
    projectDir: root,
    kind: 'workflow.job.created',
    mode: 'workflow',
  });
  await appendSessionHistory({
    timestamp: '2026-01-01T00:01:00Z',
    projectDir: root,
    kind: 'review.job.created',
    mode: 'review',
  });
  const events = await readSessionHistory(root);
  assert.equal(events.length, 2);
  const filtered = await searchSessionHistory(root, { mode: 'review' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, 'review.job.created');
});
