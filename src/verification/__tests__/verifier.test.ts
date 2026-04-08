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
  await fs.writeFile(path.join(root, 'manifest.json'), '{"sourceOwnership":"third-party"}\n', 'utf8');
  await fs.writeFile(path.join(root, 'final', 'aggregate.md'), '# aggregate\n', 'utf8');
  await fs.writeFile(path.join(root, 'cards', 'hook-doctor.md'), sampleCard('hook-doctor'), 'utf8');
  const result = await verifyReviewJob(root);
  assert.equal(result.ok, true);
  assert.ok(typeof result.quality?.compositeScore === 'number');
  assert.equal(result.quality?.overallShip, 'no-ship');
});

test('verifyWorkflowJob checks manifest and state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-verify-workflow-'));
  const reviewRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-verify-workflow-review-'));
  await fs.mkdir(path.join(root, 'runtime'), { recursive: true });
  await fs.mkdir(path.join(reviewRoot, 'cards'), { recursive: true });
  await fs.mkdir(path.join(reviewRoot, 'final'), { recursive: true });
  await fs.writeFile(path.join(reviewRoot, 'manifest.json'), '{"sourceOwnership":"third-party"}\n', 'utf8');
  await fs.writeFile(path.join(reviewRoot, 'final', 'aggregate.md'), '# aggregate\n', 'utf8');
  await fs.writeFile(path.join(reviewRoot, 'cards', 'hook-doctor.md'), sampleCard('hook-doctor'), 'utf8');
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ reviewJobDir: reviewRoot }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'RUNBOOK.md'), '# runbook\n', 'utf8');
  await fs.writeFile(path.join(root, 'runtime', 'state.json'), '{}\n', 'utf8');
  const result = await verifyWorkflowJob(root);
  assert.equal(result.ok, true);
  assert.ok(typeof result.review?.compositeScore === 'number');
  assert.equal(result.review?.publishReady, false);
});

function sampleCard(reviewer: string): string {
  return [
    '---',
    `reviewer: ${reviewer}`,
    'verdict: fail',
    'priority: P0',
    'confidence: high',
    'ship: no-ship',
    '---',
    '',
    '# Review card',
    '',
    '## Strongest evidence',
    '- The opening is still slow.',
    '',
    '## Top issues',
    '- [P0] The opening hook lands too late.',
    '',
    '## Sections to patch',
    '- Opening page',
    '',
    '## Ship recommendation',
    '- no-ship',
    '',
  ].join('\n');
}
