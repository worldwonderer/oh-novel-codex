import fs from 'node:fs/promises';
import path from 'node:path';

export type WorkflowPhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type WorkflowPhase = {
  name: string;
  kind: 'draft' | 'review' | 'aggregate';
  promptPath?: string;
  logPath?: string;
  lastMessagePath?: string;
  status: WorkflowPhaseStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type WorkflowState = {
  createdAt: string;
  updatedAt: string;
  phases: WorkflowPhase[];
};

const workflowStateLocks = new Map<string, Promise<void>>();

export async function initializeWorkflowState(jobDir: string, phases: WorkflowPhase[]): Promise<string> {
  const runtimeDir = path.join(jobDir, 'runtime');
  await fs.mkdir(runtimeDir, { recursive: true });
  const statePath = path.join(runtimeDir, 'state.json');
  const now = new Date().toISOString();
  const state: WorkflowState = {
    createdAt: now,
    updatedAt: now,
    phases,
  };
  await writeWorkflowState(statePath, state);
  return statePath;
}

export async function readWorkflowState(statePath: string): Promise<WorkflowState> {
  return JSON.parse(await fs.readFile(statePath, 'utf8')) as WorkflowState;
}

export async function writeWorkflowState(statePath: string, state: WorkflowState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function markPhaseRunning(statePath: string, phaseName: string): Promise<WorkflowState> {
  return withWorkflowStateLock(statePath, async () => {
    const state = await readWorkflowState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'running';
    phase.startedAt = new Date().toISOString();
    phase.error = undefined;
    await writeWorkflowState(statePath, state);
    return state;
  });
}

export async function markPhaseCompleted(statePath: string, phaseName: string): Promise<WorkflowState> {
  return withWorkflowStateLock(statePath, async () => {
    const state = await readWorkflowState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'completed';
    phase.completedAt = new Date().toISOString();
    phase.error = undefined;
    await writeWorkflowState(statePath, state);
    return state;
  });
}

export async function markPhaseFailed(statePath: string, phaseName: string, error: string): Promise<WorkflowState> {
  return withWorkflowStateLock(statePath, async () => {
    const state = await readWorkflowState(statePath);
    const phase = requirePhase(state, phaseName);
    phase.status = 'failed';
    phase.completedAt = new Date().toISOString();
    phase.error = error;
    await writeWorkflowState(statePath, state);
    return state;
  });
}

export async function resetPhasesFrom(statePath: string, phaseName: string): Promise<WorkflowState> {
  return withWorkflowStateLock(statePath, async () => {
    const state = await readWorkflowState(statePath);
    const index = state.phases.findIndex((phase) => phase.name === phaseName);
    if (index === -1) throw new Error(`Unknown phase: ${phaseName}`);
    for (let i = index; i < state.phases.length; i += 1) {
      state.phases[i].status = 'pending';
      state.phases[i].startedAt = undefined;
      state.phases[i].completedAt = undefined;
      state.phases[i].error = undefined;
    }
    await writeWorkflowState(statePath, state);
    return state;
  });
}

function requirePhase(state: WorkflowState, phaseName: string): WorkflowPhase {
  const phase = state.phases.find((item) => item.name === phaseName);
  if (!phase) throw new Error(`Unknown phase: ${phaseName}`);
  return phase;
}

async function withWorkflowStateLock<T>(statePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = workflowStateLocks.get(statePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  workflowStateLocks.set(statePath, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (workflowStateLocks.get(statePath) === current) {
      workflowStateLocks.delete(statePath);
    }
  }
}
