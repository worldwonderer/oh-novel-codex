import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderAttentionStatePath, readLeaderAttentionState } from '../attention.js';
import { deriveRuntimeStatePath } from '../codex.js';
import { fallbackWatcherStatePath, readFallbackWatcherState, runFallbackWatcherTick } from '../fallback-watcher.js';
import { updateModeState } from '../../state/mode-state.js';

test('runFallbackWatcherTick writes watcher state for an untracked workflow job', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-fallback-watcher-'));
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

  await runFallbackWatcherTick({
    projectDir: root,
    once: true,
    dryRun: true,
    resumeUntracked: true,
    untrackedGraceMs: 0,
  });

  const state = await readFallbackWatcherState(root);
  assert.ok(state);
  assert.equal(state?.active, true);
  assert.ok(state?.lastTickAt);
  assert.equal(state?.lastEntries[0].problem, 'untracked');
  assert.ok(state?.lastReason);
  await fs.access(fallbackWatcherStatePath(root));
});

test('runFallbackWatcherTick can observe stalled runtime heartbeat', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-fallback-watcher-stalled-'));
  const jobDir = path.join(root, '.onx', 'reviews', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'review', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'hook-doctor',
  });
  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'hook-doctor',
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

  const state = await runFallbackWatcherTick({
    projectDir: root,
    once: true,
    dryRun: true,
    resumeStalled: true,
    stalledGraceMs: 0,
  });
  assert.equal(state.lastEntries[0].problem, 'stalled');
});

test('runFallbackWatcherTick can nudge stalled tmux-bound work without resume flags', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-fallback-watcher-nudge-only-'));
  const jobDir = path.join(root, '.onx', 'reviews', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'review', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'hook-doctor',
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
          name: 'hook-doctor',
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

  const state = await runFallbackWatcherTick({
    projectDir: root,
    once: true,
    dryRun: true,
    nudgeStalled: true,
    stalledGraceMs: 0,
  });

  assert.equal(state.lastEntries[0].problem, 'stalled');
  assert.ok(state.lastRecoveredAt);
  const eventsLog = await fs.readFile(path.join(root, '.onx', 'logs', 'events.jsonl'), 'utf8');
  assert.match(eventsLog, /runtime\.watchdog\.nudged/);
});

test('runFallbackWatcherTick records latest event snapshot when events log exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-fallback-watcher-events-'));
  const eventsPath = path.join(root, '.onx', 'logs', 'events.jsonl');
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });
  await fs.writeFile(eventsPath, `${JSON.stringify({ kind: 'draft.job.created', timestamp: new Date().toISOString() })}\n`, 'utf8');

  const state = await runFallbackWatcherTick({
    projectDir: root,
    once: true,
    dryRun: true,
  });

  assert.ok(state.lastEventAt);
  assert.ok(typeof state.lastEventSize === 'number' && state.lastEventSize > 0);
});

test('runFallbackWatcherTick writes leader attention state from OMX team pressure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-fallback-attention-'));
  const teamRoot = path.join(root, '.omx', 'state', 'team', 'demo-team');
  await fs.mkdir(path.join(teamRoot, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(teamRoot, 'mailbox'), { recursive: true });
  await fs.mkdir(path.join(teamRoot, 'workers', 'worker-1'), { recursive: true });
  await fs.writeFile(path.join(teamRoot, 'config.json'), JSON.stringify({ name: 'demo-team', workers: [{ name: 'worker-1' }] }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'tasks', 'task-1.json'), JSON.stringify({ status: 'pending' }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'mailbox', 'leader-fixed.json'), JSON.stringify({ messages: [{ from_worker: 'worker-1', body: 'need help' }] }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'monitor-snapshot.json'), JSON.stringify({ workerAliveByName: { 'worker-1': false } }, null, 2));

  const state = await runFallbackWatcherTick({
    projectDir: root,
    once: true,
    dryRun: true,
  });

  assert.equal(state.leaderAttentionPending, true);
  const attention = await readLeaderAttentionState(root);
  assert.equal(attention?.needsAttention, true);
  assert.ok(attention?.summary.some((item) => item.startsWith('omx-team:demo-team')));
  await fs.access(leaderAttentionStatePath(root));
});
