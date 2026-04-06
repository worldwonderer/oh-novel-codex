import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRuntimeStatePath } from '../codex.js';
import { recoverRuntimeHealth, scanActiveRuntimeHealth } from '../watchdog.js';
import { readModeState, updateModeState } from '../../state/mode-state.js';
import { createReviewJob } from '../../review/runner.js';
import { createTeamJob } from '../../team/runtime.js';

test('scanActiveRuntimeHealth reports resumable orphaned workflow phase', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
  });

  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );

  await fs.writeFile(
    deriveRuntimeStatePath(logPath),
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      command: ['codex', 'exec'],
      logPath,
      lastMessagePath,
      runtimeStatePath: deriveRuntimeStatePath(logPath),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString(),
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  const entries = await scanActiveRuntimeHealth(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].mode, 'workflow');
  assert.equal(entries[0].problem, 'orphaned');
  assert.equal(entries[0].resumable, true);
});

test('scanActiveRuntimeHealth reports stalled workflow phase when pid is alive but progress is stale', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-stalled-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
  });

  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );

  await fs.writeFile(
    deriveRuntimeStatePath(logPath),
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      pid: process.pid,
      command: ['codex', 'exec'],
      logPath,
      lastMessagePath,
      runtimeStatePath: deriveRuntimeStatePath(logPath),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(Date.now() - 120_000).toISOString(),
      stallTimeoutMs: 1000,
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  const entries = await scanActiveRuntimeHealth(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].problem, 'stalled');
  assert.equal(entries[0].resumable, true);
});

test('scanActiveRuntimeHealth reports untracked workflow phase when no runtime heartbeat exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-untracked-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
  });

  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date(Date.now() - 300_000).toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );

  const entries = await scanActiveRuntimeHealth(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].problem, 'untracked');
  assert.equal(entries[0].resumable, true);
});

test('recoverRuntimeHealth can dry-run recover an orphaned team lane', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-team-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft', 'utf8');
  const reviewJob = await createReviewJob({ draftPath: draft, projectDir: root });
  const teamJob = await createTeamJob({ reviewJobDir: reviewJob.jobDir, projectDir: root });

  const teamStatePath = path.join(teamJob.jobDir, 'runtime', 'state.json');
  const teamState = JSON.parse(await fs.readFile(teamStatePath, 'utf8'));
  teamState.lanes[0].status = 'running';
  teamState.lanes[0].startedAt = new Date(Date.now() - 120_000).toISOString();
  await fs.writeFile(teamStatePath, JSON.stringify(teamState, null, 2), 'utf8');

  await updateModeState(root, 'team', {
    active: true,
    status: 'running',
    jobDir: teamJob.jobDir,
    currentPhase: teamState.lanes[0].name,
  });

  const runtimeStatePath = deriveRuntimeStatePath(teamState.lanes[0].logPath);
  await fs.mkdir(path.dirname(runtimeStatePath), { recursive: true });
  await fs.writeFile(
    runtimeStatePath,
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      command: ['codex', 'exec'],
      logPath: teamState.lanes[0].logPath,
      lastMessagePath: teamState.lanes[0].lastMessagePath,
      runtimeStatePath,
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date().toISOString(),
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  const entries = await recoverRuntimeHealth(root, { dryRun: true });
  assert.equal(entries.some((entry) => entry.mode === 'team' && entry.problem === 'orphaned'), true);

  const teamMode = await readModeState(root, 'team');
  assert.equal(teamMode?.status, 'running');
});

test('recoverRuntimeHealth can nudge a stalled tmux-bound workflow instead of restarting it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-nudge-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
    metadata: {
      tmuxPane: '%9',
    },
  });

  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );

  await fs.writeFile(
    deriveRuntimeStatePath(logPath),
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      pid: process.pid,
      command: ['codex', 'exec'],
      logPath,
      lastMessagePath,
      runtimeStatePath: deriveRuntimeStatePath(logPath),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(Date.now() - 120_000).toISOString(),
      stallTimeoutMs: 1000,
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  let nudged = false;
  await recoverRuntimeHealth(
    root,
    { nudgeStalled: true, stalledGraceMs: 0 },
    {
      readTmuxPaneHealth: async () => ({
        pane: '%9',
        ok: true,
        reason: 'ok',
        width: 120,
        height: 30,
        currentCommand: 'codex',
        dead: false,
        inMode: false,
        looksReady: true,
        bootstrapping: false,
      }),
      nudgeTmuxPane: async () => {
        nudged = true;
        return { nudged: true, reason: 'sent' };
      },
    },
  );

  assert.equal(nudged, true);
  const eventsLog = await fs.readFile(path.join(root, '.onx', 'logs', 'events.jsonl'), 'utf8');
  assert.match(eventsLog, /runtime.watchdog.nudged/);
});

test('recoverRuntimeHealth falls back to recovery when tmux nudges are exhausted', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-nudge-fallback-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');
  const { createWorkflowJob } = await import('../../workflow/runner.js');
  const workflow = await createWorkflowJob({ brief: '改成知乎体长稿', sourcePath: source, projectDir: root, mode: 'zhihu-remix' });
  const statePath = path.join(workflow.jobDir, 'runtime', 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  state.phases[0].status = 'running';
  state.phases[0].startedAt = new Date(Date.now() - 120_000).toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir: workflow.jobDir,
    currentPhase: state.phases[0].name,
    metadata: { tmuxPane: '%9' },
  });

  await fs.mkdir(path.dirname(deriveRuntimeStatePath(state.phases[0].logPath)), { recursive: true });
  await fs.writeFile(
    deriveRuntimeStatePath(state.phases[0].logPath),
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      pid: process.pid,
      command: ['codex', 'exec'],
      logPath: state.phases[0].logPath,
      lastMessagePath: state.phases[0].lastMessagePath,
      runtimeStatePath: deriveRuntimeStatePath(state.phases[0].logPath),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(Date.now() - 120_000).toISOString(),
      stallTimeoutMs: 1000,
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  await recoverRuntimeHealth(
    root,
    { nudgeStalled: true, resumeStalled: true, stalledGraceMs: 0, dryRun: true },
    {
      nudgeTmuxPane: async () => ({ nudged: false, reason: 'max_nudges_exhausted' }),
    },
  );

  const workflowMode = await readModeState(root, 'workflow');
  assert.equal(workflowMode?.status, 'completed');
});

test('recoverRuntimeHealth applies layout guard before nudging narrow tmux panes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-layout-guard-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
    metadata: { tmuxPane: '%9' },
  });
  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );
  await fs.writeFile(
    deriveRuntimeStatePath(logPath),
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      pid: process.pid,
      command: ['codex', 'exec'],
      logPath,
      lastMessagePath,
      runtimeStatePath: deriveRuntimeStatePath(logPath),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(Date.now() - 180_000).toISOString(),
      stallTimeoutMs: 1000,
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  let guarded = false;
  await recoverRuntimeHealth(
    root,
    { nudgeStalled: true, stalledGraceMs: 0 },
    {
      readTmuxPaneHealth: async () => ({
        pane: '%9',
        ok: false,
        reason: 'pane_too_narrow',
        width: 5,
        height: 10,
        currentCommand: 'codex',
        dead: false,
        inMode: false,
        looksReady: true,
        bootstrapping: false,
      }),
      applyTmuxLayoutGuard: async () => {
        guarded = true;
        return {
          applied: true,
          reason: 'resized',
          before: {
            pane: '%9',
            ok: false,
            reason: 'pane_too_narrow',
            width: 5,
            height: 10,
            currentCommand: 'codex',
            dead: false,
            inMode: false,
            looksReady: true,
            bootstrapping: false,
          },
          after: {
            pane: '%9',
            ok: true,
            reason: 'ok',
            width: 120,
            height: 30,
            currentCommand: 'codex',
            dead: false,
            inMode: false,
            looksReady: true,
            bootstrapping: false,
          },
        };
      },
      nudgeTmuxPane: async () => ({ nudged: true, reason: 'sent' }),
    },
  );

  assert.equal(guarded, true);
});
