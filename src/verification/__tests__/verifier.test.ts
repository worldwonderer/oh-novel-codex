import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDraftJob, verifyReviewJob, verifyWorkflowJob } from '../verifier.js';

test('verifyDraftJob checks outputs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-verify-draft-'));
  const outputs = path.join(root, 'outputs');
  await fs.mkdir(outputs, { recursive: true });
  for (const name of ['architecture.md', 'outline.md', 'draft.md']) {
    await fs.writeFile(path.join(outputs, name), '# x\n', 'utf8');
  }
  const result = await verifyDraftJob(root);
  assert.equal(result.ok, true);
});

test('verifyReviewJob checks final aggregate', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-verify-review-'));
  await fs.mkdir(path.join(root, 'cards'), { recursive: true });
  await fs.mkdir(path.join(root, 'final'), { recursive: true });
  await fs.writeFile(path.join(root, 'manifest.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(root, 'final', 'aggregate.md'), '# aggregate\n', 'utf8');
  const result = await verifyReviewJob(root);
  assert.equal(result.ok, true);
});

test('verifyWorkflowJob checks manifest and state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-verify-workflow-'));
  await fs.mkdir(path.join(root, 'runtime'), { recursive: true });
  await fs.writeFile(path.join(root, 'manifest.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(root, 'RUNBOOK.md'), '# runbook\n', 'utf8');
  await fs.writeFile(path.join(root, 'runtime', 'state.json'), '{}\n', 'utf8');
  const result = await verifyWorkflowJob(root);
  assert.equal(result.ok, true);
});
