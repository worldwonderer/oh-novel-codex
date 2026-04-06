import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowJob } from '../runner.js';
import { executeWorkflowJob } from '../execute.js';
import { readModeState } from '../../state/mode-state.js';

test('executeWorkflowJob runs draft and review phases in dry-run mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-exec-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '改成知乎体长稿',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
  });

  const summary = await executeWorkflowJob({
    jobDir: workflow.jobDir,
    dryRun: true,
  });

  assert.ok(summary.draftPhases.length >= 3);
  assert.ok(summary.reviewPhases.length >= 5);
  const aggregate = await fs.readFile(summary.aggregatePath, 'utf8');
  assert.match(aggregate, /ONX Review Aggregate/);
  assert.equal(summary.qualityShip, 'ship');
});

test('materialized review-phase skip updates review mode instead of draft mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-skip-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '改成知乎体长稿',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
  });

  await executeWorkflowJob({
    jobDir: workflow.jobDir,
    dryRun: true,
  });

  await executeWorkflowJob({
    jobDir: workflow.jobDir,
    dryRun: true,
    fromPhase: 'review:hook-doctor',
    toPhase: 'review:hook-doctor',
  });

  const reviewState = await readModeState(root, 'review');
  const draftState = await readModeState(root, 'draft');

  assert.equal(reviewState?.currentPhase, 'review:hook-doctor');
  assert.notEqual(draftState?.currentPhase, 'review:hook-doctor');
});
