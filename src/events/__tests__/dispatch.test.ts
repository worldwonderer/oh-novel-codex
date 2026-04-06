import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchEvent } from '../dispatch.js';

test('dispatchEvent appends to events log', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-event-log-'));
  await dispatchEvent(root, {
    kind: 'draft.job.created',
    mode: 'draft',
    jobDir: '/tmp/draft-job',
  });
  const logPath = path.join(root, '.onx', 'logs', 'events.jsonl');
  const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]) as { kind: string };
  assert.equal(event.kind, 'draft.job.created');
});

test('dispatchEvent can invoke external hook', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-event-hook-'));
  const hookOutput = path.join(root, 'hook.json');
  await dispatchEvent(
    root,
    {
      kind: 'workflow.job.created',
      mode: 'workflow',
      jobDir: '/tmp/workflow-job',
    },
    {
      hookCommand: `cat > ${hookOutput}`,
    },
  );
  const hook = JSON.parse(await fs.readFile(hookOutput, 'utf8')) as { kind: string };
  assert.equal(hook.kind, 'workflow.job.created');
});
