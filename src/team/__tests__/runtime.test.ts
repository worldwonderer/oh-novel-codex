import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewJob } from '../../review/runner.js';
import { createTeamJob, executeTeamJob, getTeamStatus } from '../runtime.js';
import { readModeState } from '../../state/mode-state.js';

test('team runtime creates and executes lane workers in dry-run mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-team-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    projectDir: root,
  });
  const team = await createTeamJob({
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
  });

  const result = await executeTeamJob({
    jobDir: team.jobDir,
    dryRun: true,
    parallel: true,
  });

  assert.ok(result.phases.length >= 5);
  const aggregate = await fs.readFile(result.aggregatePath, 'utf8');
  assert.match(aggregate, /ONX Review Aggregate/);
  const status = await getTeamStatus(team.jobDir);
  assert.match(status, /hook-doctor \| completed/);
});

test('team runtime keeps team/review running when only a subset of lanes executes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-team-partial-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    projectDir: root,
  });
  const team = await createTeamJob({
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
  });

  const result = await executeTeamJob({
    jobDir: team.jobDir,
    dryRun: true,
    parallel: false,
    fromLane: 'hook-doctor',
    toLane: 'hook-doctor',
  });

  assert.equal(result.phases.length, 1);
  await assert.rejects(fs.access(result.aggregatePath));

  const status = await getTeamStatus(team.jobDir);
  assert.match(status, /hook-doctor \| completed/);
  assert.match(status, /character-doctor \| pending/);

  const teamMode = await readModeState(root, 'team');
  const reviewMode = await readModeState(root, 'review');
  assert.equal(teamMode?.status, 'running');
  assert.equal(teamMode?.currentPhase, 'character-doctor');
  assert.equal(reviewMode?.status, 'running');
  assert.equal(reviewMode?.currentPhase, 'character-doctor');
});
