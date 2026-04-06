import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeReviewState, markReviewPhaseCompleted, markReviewPhaseRunning, readReviewState, resetReviewPhasesFrom } from '../state.js';

test('review state initializes and updates phase statuses', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-review-state-'));
  const statePath = await initializeReviewState(root, [
    { name: 'hook-doctor', status: 'pending' },
    { name: 'aggregate', status: 'pending' },
  ]);

  await markReviewPhaseRunning(statePath, 'hook-doctor');
  await markReviewPhaseCompleted(statePath, 'hook-doctor');
  const state = await readReviewState(statePath);
  assert.equal(state.phases[0].status, 'completed');
});

test('resetReviewPhasesFrom resets trailing phases', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-review-reset-'));
  const statePath = await initializeReviewState(root, [
    { name: 'hook-doctor', status: 'completed' },
    { name: 'character-doctor', status: 'completed' },
    { name: 'aggregate', status: 'completed' },
  ]);

  await resetReviewPhasesFrom(statePath, 'character-doctor');
  const state = await readReviewState(statePath);
  assert.equal(state.phases[0].status, 'completed');
  assert.equal(state.phases[1].status, 'pending');
  assert.equal(state.phases[2].status, 'pending');
});
