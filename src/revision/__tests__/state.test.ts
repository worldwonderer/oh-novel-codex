import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeRevisionState, markRevisionPhaseCompleted, markRevisionPhaseRunning, readRevisionState, resetRevisionPhasesFrom } from '../state.js';

test('revision state tracks phase changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-state-'));
  const statePath = await initializeRevisionState(root, [
    { name: '01-fix-plan', status: 'pending' },
    { name: '02-revision-writer', status: 'pending' },
  ]);
  await markRevisionPhaseRunning(statePath, '01-fix-plan');
  await markRevisionPhaseCompleted(statePath, '01-fix-plan');
  const state = await readRevisionState(statePath);
  assert.equal(state.phases[0].status, 'completed');
});

test('resetRevisionPhasesFrom resets downstream phases', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-reset-'));
  const statePath = await initializeRevisionState(root, [
    { name: '01-fix-plan', status: 'completed' },
    { name: '02-revision-writer', status: 'completed' },
  ]);
  await resetRevisionPhasesFrom(statePath, '02-revision-writer');
  const state = await readRevisionState(statePath);
  assert.equal(state.phases[0].status, 'completed');
  assert.equal(state.phases[1].status, 'pending');
});
