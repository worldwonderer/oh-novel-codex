import fs from 'node:fs/promises';
import path from 'node:path';

export type RevisionPhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export type RevisionPhase = {
  name: string;
  promptPath?: string;
  logPath?: string;
  lastMessagePath?: string;
  status: RevisionPhaseStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type RevisionState = {
  createdAt: string;
  updatedAt: string;
  phases: RevisionPhase[];
};

const revisionStateLocks = new Map<string, Promise<void>>();

export async function initializeRevisionState(jobDir: string, phases: RevisionPhase[]): Promise<string> {
  const runtimeDir = path.join(jobDir, 'runtime');
  await fs.mkdir(runtimeDir, { recursive: true });
  const statePath = path.join(runtimeDir, 'state.json');
  const now = new Date().toISOString();
  const state: RevisionState = { createdAt: now, updatedAt: now, phases };
  await writeRevisionState(statePath, state);
  return statePath;
}

export async function readRevisionState(statePath: string): Promise<RevisionState> {
  return JSON.parse(await fs.readFile(statePath, 'utf8')) as RevisionState;
}

export async function writeRevisionState(statePath: string, state: RevisionState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function markRevisionPhaseRunning(statePath: string, phaseName: string): Promise<void> {
  await withRevisionStateLock(statePath, async () => {
    const state = await readRevisionState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'running';
    phase.startedAt = new Date().toISOString();
    phase.error = undefined;
    await writeRevisionState(statePath, state);
  });
}

export async function markRevisionPhaseCompleted(statePath: string, phaseName: string): Promise<void> {
  await withRevisionStateLock(statePath, async () => {
    const state = await readRevisionState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'completed';
    phase.completedAt = new Date().toISOString();
    phase.error = undefined;
    await writeRevisionState(statePath, state);
  });
}

export async function markRevisionPhaseFailed(statePath: string, phaseName: string, error: string): Promise<void> {
  await withRevisionStateLock(statePath, async () => {
    const state = await readRevisionState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'failed';
    phase.completedAt = new Date().toISOString();
    phase.error = error;
    await writeRevisionState(statePath, state);
  });
}

export async function resetRevisionPhasesFrom(statePath: string, phaseName: string): Promise<void> {
  await withRevisionStateLock(statePath, async () => {
    const state = await readRevisionState(statePath);
    const index = state.phases.findIndex((phase) => phase.name === phaseName);
    if (index === -1) throw new Error(`Unknown revision phase: ${phaseName}`);
    for (let i = index; i < state.phases.length; i += 1) {
      state.phases[i].status = 'pending';
      state.phases[i].startedAt = undefined;
      state.phases[i].completedAt = undefined;
      state.phases[i].error = undefined;
    }
    await writeRevisionState(statePath, state);
  });
}

function requirePhase(state: RevisionState, phaseName: string): RevisionPhase {
  const phase = state.phases.find((item) => item.name === phaseName);
  if (!phase) throw new Error(`Unknown revision phase: ${phaseName}`);
  return phase;
}

async function withRevisionStateLock<T>(statePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = revisionStateLocks.get(statePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  revisionStateLocks.set(statePath, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (revisionStateLocks.get(statePath) === current) {
      revisionStateLocks.delete(statePath);
    }
  }
}
