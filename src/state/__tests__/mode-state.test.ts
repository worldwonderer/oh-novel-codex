import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { listModeStates, readModeState, resolveLatestModeJob, updateModeState } from '../mode-state.js';

test('updateModeState writes and reads mode state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-mode-state-'));
  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir: '/tmp/job',
    currentPhase: 'draft:01-novel-architect',
  });

  const state = await readModeState(root, 'workflow');
  assert.ok(state);
  assert.equal(state?.status, 'running');
  assert.equal(state?.jobDir, '/tmp/job');
});

test('listModeStates returns written states only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-mode-list-'));
  await updateModeState(root, 'draft', {
    active: true,
    status: 'planned',
    jobDir: '/tmp/draft-job',
  });
  const states = await listModeStates(root);
  assert.equal(states.length, 1);
  assert.equal(states[0].mode, 'draft');
});

test('resolveLatestModeJob returns stored jobDir', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-mode-latest-'));
  await updateModeState(root, 'review', {
    active: false,
    status: 'completed',
    jobDir: '/tmp/review-job',
  });
  const latest = await resolveLatestModeJob(root, 'review');
  assert.equal(latest, '/tmp/review-job');
});
