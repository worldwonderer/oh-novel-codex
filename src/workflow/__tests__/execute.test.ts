import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowJob } from '../runner.js';
import { executeWorkflowJob } from '../execute.js';
import { extractOutputTargets } from '../../runtime/codex.js';
import { readModeState } from '../../state/mode-state.js';
import type { PromptExecutor } from '../../runtime/types.js';

const LONG_DRAFT = `${'甲'.repeat(8200)}\n`;
const SHORT_DRAFT = '甲乙丙丁戊己庚辛壬癸十一二三四\n';

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
  assert.equal(summary.publishReadiness?.ready, true);
  assert.ok((summary.iterations?.[0]?.compositeScore ?? 0) > 0);
});

test('executeWorkflowJob triggers a revision loop when originality gate fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-originality-loop-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '改成知乎体长稿',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
    targetLength: '10-20 Chinese characters',
  });

  let remixFailuresRemaining = 1;
  const executor: PromptExecutor = async (options) => {
    const prompt = await fs.readFile(options.promptPath, 'utf8');
    const targets = extractOutputTargets(prompt);
    const isRevisionJob = options.projectDir.includes(`${path.sep}.onx${path.sep}revisions${path.sep}jobs${path.sep}`);

    await fs.mkdir(path.dirname(options.logPath), { recursive: true });
    await fs.writeFile(options.logPath, 'test executor\n', 'utf8');
    await fs.writeFile(options.lastMessagePath, 'test executor\n', 'utf8');

    for (const target of targets) {
      await fs.mkdir(path.dirname(target.path), { recursive: true });
      if (target.kind === 'review-card') {
        const isRemix = target.reviewer === 'remix-depth-reviewer';
        const fail = isRemix && remixFailuresRemaining > 0;
        if (fail) remixFailuresRemaining -= 1;
        const card = `---
reviewer: ${target.reviewer}
verdict: ${fail ? 'fail' : 'pass'}
priority: ${fail ? 'P0' : 'P2'}
confidence: high
ship: ${fail ? 'no-ship' : 'ship'}
---

# Review card

## Strongest evidence
- ${fail ? 'Skeleton is still too close to the source.' : 'Structure is now sufficiently remixed.'}

## Top issues
${fail ? '- [P0] Replace at least three source-shadow set pieces.' : ''}

## Sections to patch
${fail ? '- Rewrite the core skeleton nodes.' : ''}

## Ship recommendation
- ${fail ? 'no-ship' : 'ship'}
`;
        await fs.writeFile(target.path, card, 'utf8');
      } else if (target.kind === 'draft') {
        await fs.writeFile(target.path, isRevisionJob ? LONG_DRAFT : SHORT_DRAFT, 'utf8');
      } else {
        await fs.writeFile(target.path, '# output\n', 'utf8');
      }
    }

    return {
      promptPath: options.promptPath,
      logPath: options.logPath,
      lastMessagePath: options.lastMessagePath,
      dryRun: false,
      command: ['test-executor'],
      attempts: 1,
      completionReason: 'process-exit',
    };
  };

  const summary = await executeWorkflowJob({
    jobDir: workflow.jobDir,
    executor,
  });

  assert.equal(summary.overallShip, 'ship');
  assert.equal(summary.originalityRisk, 'low');
  assert.equal(summary.publishReadiness?.ready, true);
  assert.ok((summary.iterations?.length ?? 0) >= 2);
  const revisionIteration = summary.iterations?.find((iteration) => iteration.stage === 'revision');
  assert.equal(revisionIteration?.revisionFocus, 'all');
  assert.equal(revisionIteration?.revisionStrategy, 'structural-rebuild');
  assert.equal(revisionIteration?.publishReadiness?.ready, true);
});

test('executeWorkflowJob does not gate self-owned adaptations on remix-depth alone', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-owned-source-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '作者自改知乎体长稿',
    sourcePath: source,
    sourceOwnership: 'self-owned',
    projectDir: root,
    mode: 'zhihu-remix',
    targetLength: '10-20 Chinese characters',
  });

  const executor: PromptExecutor = async (options) => {
    const prompt = await fs.readFile(options.promptPath, 'utf8');
    const targets = extractOutputTargets(prompt);
    const isRevisionJob = options.projectDir.includes(`${path.sep}.onx${path.sep}revisions${path.sep}jobs${path.sep}`);

    await fs.mkdir(path.dirname(options.logPath), { recursive: true });
    await fs.writeFile(options.logPath, 'test executor\n', 'utf8');
    await fs.writeFile(options.lastMessagePath, 'test executor\n', 'utf8');

    for (const target of targets) {
      await fs.mkdir(path.dirname(target.path), { recursive: true });
      if (target.kind === 'review-card') {
        const isRemix = target.reviewer === 'remix-depth-reviewer';
        const card = `---
reviewer: ${target.reviewer}
verdict: ${isRemix ? 'fail' : 'pass'}
priority: ${isRemix ? 'P0' : 'P2'}
confidence: high
ship: ${isRemix ? 'no-ship' : 'ship'}
---

# Review card

## Strongest evidence
- ${isRemix ? 'Source-shadow still feels stale.' : 'Quality is ship-safe.'}

## Top issues
${isRemix ? '- [P0] Refresh the adaptation shape.' : ''}

## Sections to patch
${isRemix ? '- adaptation structure' : ''}

## Ship recommendation
- ${isRemix ? 'no-ship' : 'ship'}
`;
        await fs.writeFile(target.path, card, 'utf8');
      } else if (target.kind === 'draft') {
        await fs.writeFile(target.path, isRevisionJob ? LONG_DRAFT : SHORT_DRAFT, 'utf8');
      } else {
        await fs.writeFile(target.path, '# output\n', 'utf8');
      }
    }

    return {
      promptPath: options.promptPath,
      logPath: options.logPath,
      lastMessagePath: options.lastMessagePath,
      dryRun: false,
      command: ['test-executor'],
      attempts: 1,
      completionReason: 'process-exit',
    };
  };

  const summary = await executeWorkflowJob({
    jobDir: workflow.jobDir,
    executor,
  });

  assert.equal(summary.overallShip, 'ship');
  assert.equal(summary.qualityShip, 'ship');
  assert.equal(summary.originalityRisk, 'high');
  assert.equal(summary.publishReadiness?.ready, true);
  assert.equal(summary.iterations?.length ?? 0, 1);
});

test('executeWorkflowJob respects configured publish thresholds', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-thresholds-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '改成知乎体长稿',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
    publishThresholds: {
      continuity: 95,
    },
  });

  await assert.rejects(
    () => executeWorkflowJob({
      jobDir: workflow.jobDir,
      dryRun: true,
    }),
    /publish-ready verdict/i,
  );

  const manifest = JSON.parse(await fs.readFile(workflow.manifestPath, 'utf8')) as {
    publishThresholds: { continuity: number };
    iterations: Array<{ stage: string; publishReadiness?: { ready: boolean; failingDimensions: string[] } }>;
  };
  assert.equal(manifest.publishThresholds.continuity, 95);
  assert.ok(manifest.iterations.length >= 2);
  assert.ok(manifest.iterations.some((iteration) => iteration.publishReadiness?.failingDimensions.includes('continuity')));
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
