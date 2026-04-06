import fs from 'node:fs/promises';
import path from 'node:path';

export type ReviewPhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ReviewPhase = {
  name: string;
  promptPath?: string;
  logPath?: string;
  lastMessagePath?: string;
  status: ReviewPhaseStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type ReviewState = {
  createdAt: string;
  updatedAt: string;
  phases: ReviewPhase[];
};

const reviewStateLocks = new Map<string, Promise<void>>();

export async function initializeReviewState(jobDir: string, phases: ReviewPhase[]): Promise<string> {
  const runtimeDir = path.join(jobDir, 'runtime');
  await fs.mkdir(runtimeDir, { recursive: true });
  const statePath = path.join(runtimeDir, 'state.json');
  const now = new Date().toISOString();
  const state: ReviewState = {
    createdAt: now,
    updatedAt: now,
    phases,
  };
  await writeReviewState(statePath, state);
  return statePath;
}

export async function readReviewState(statePath: string): Promise<ReviewState> {
  return JSON.parse(await fs.readFile(statePath, 'utf8')) as ReviewState;
}

export async function writeReviewState(statePath: string, state: ReviewState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function markReviewPhaseRunning(statePath: string, phaseName: string): Promise<ReviewState> {
  return withReviewStateLock(statePath, async () => {
    const state = await readReviewState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'running';
    phase.startedAt = new Date().toISOString();
    phase.error = undefined;
    await writeReviewState(statePath, state);
    return state;
  });
}

export async function markReviewPhaseCompleted(statePath: string, phaseName: string): Promise<ReviewState> {
  return withReviewStateLock(statePath, async () => {
    const state = await readReviewState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'completed';
    phase.completedAt = new Date().toISOString();
    phase.error = undefined;
    await writeReviewState(statePath, state);
    return state;
  });
}

export async function markReviewPhaseFailed(statePath: string, phaseName: string, error: string): Promise<ReviewState> {
  return withReviewStateLock(statePath, async () => {
    const state = await readReviewState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'failed';
    phase.completedAt = new Date().toISOString();
    phase.error = error;
    await writeReviewState(statePath, state);
    return state;
  });
}

export async function resetReviewPhasesFrom(statePath: string, phaseName: string): Promise<ReviewState> {
  return withReviewStateLock(statePath, async () => {
    const state = await readReviewState(statePath);
    const index = state.phases.findIndex((phase) => phase.name === phaseName);
    if (index === -1) throw new Error(`Unknown review phase: ${phaseName}`);
    for (let i = index; i < state.phases.length; i += 1) {
      state.phases[i].status = 'pending';
      state.phases[i].startedAt = undefined;
      state.phases[i].completedAt = undefined;
      state.phases[i].error = undefined;
    }
    await writeReviewState(statePath, state);
    return state;
  });
}

function requirePhase(state: ReviewState, phaseName: string): ReviewPhase {
  const phase = state.phases.find((item) => item.name === phaseName);
  if (!phase) throw new Error(`Unknown review phase: ${phaseName}`);
  return phase;
}

async function withReviewStateLock<T>(statePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = reviewStateLocks.get(statePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  reviewStateLocks.set(statePath, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (reviewStateLocks.get(statePath) === current) {
      reviewStateLocks.delete(statePath);
    }
  }
}
