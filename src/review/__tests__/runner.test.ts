import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReviewJob, createReviewJob } from '../runner.js';

test('createReviewJob scaffolds prompts, cards dir, and manifest', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-review-job-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, 'demo draft', 'utf8');

  const job = await createReviewJob({
    draftPath: draft,
    projectDir: root,
    jobName: 'demo-review',
  });

  const promptFiles = await fs.readdir(job.promptsDir);
  assert.ok(promptFiles.some((name) => name === 'hook-doctor.md'));
  const manifest = JSON.parse(await fs.readFile(job.manifestPath, 'utf8')) as { draftPath: string };
  assert.equal(manifest.draftPath, draft);
});

test('aggregateReviewJob writes aggregate output from cards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-review-agg-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, 'demo draft', 'utf8');

  const job = await createReviewJob({
    draftPath: draft,
    projectDir: root,
    jobName: 'aggregate-review',
  });

  await fs.writeFile(
    path.join(job.cardsDir, 'hook-doctor.md'),
    `---
reviewer: hook-doctor
verdict: fail
priority: P0
confidence: high
ship: no-ship
---

# Review card

## Strongest evidence
- opening starts flat

## Top issues
- [P0] opening lacks a first-line anomaly

## Sections to patch
- opening scene

## Ship recommendation
- no-ship
`,
    'utf8',
  );

  const output = await aggregateReviewJob(job.jobDir);
  const markdown = await fs.readFile(output, 'utf8');
  assert.match(markdown, /Overall verdict: \*\*fail\*\*/);
  assert.match(markdown, /opening lacks a first-line anomaly/);
});
