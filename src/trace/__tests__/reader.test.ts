import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readTrace, summarizeTrace } from '../reader.js';

test('trace reader parses event log and summary', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-trace-'));
  const logsDir = path.join(root, '.onx', 'logs');
  await fs.mkdir(logsDir, { recursive: true });
  await fs.writeFile(
    path.join(logsDir, 'events.jsonl'),
    [
      JSON.stringify({ kind: 'draft.job.created', timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ kind: 'workflow.phase.completed', timestamp: '2026-01-01T00:01:00Z' }),
    ].join('\n') + '\n',
    'utf8',
  );

  const events = await readTrace(root);
  const summary = await summarizeTrace(root);
  assert.equal(events.length, 2);
  assert.equal(summary.count, 2);
  assert.equal(summary.byKind['draft.job.created'], 1);
});
