import fs from 'node:fs/promises';
import path from 'node:path';
import type { TeamLane } from './types.js';

export type TeamState = {
  createdAt: string;
  updatedAt: string;
  lanes: TeamLane[];
};

const teamStateLocks = new Map<string, Promise<void>>();

export async function initializeTeamState(jobDir: string, lanes: TeamLane[]): Promise<string> {
  const runtimeDir = path.join(jobDir, 'runtime');
  await fs.mkdir(runtimeDir, { recursive: true });
  const statePath = path.join(runtimeDir, 'state.json');
  const now = new Date().toISOString();
  const state: TeamState = {
    createdAt: now,
    updatedAt: now,
    lanes,
  };
  await writeTeamState(statePath, state);
  return statePath;
}

export async function readTeamState(statePath: string): Promise<TeamState> {
  return JSON.parse(await fs.readFile(statePath, 'utf8')) as TeamState;
}

export async function writeTeamState(statePath: string, state: TeamState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function markLaneRunning(statePath: string, laneName: string): Promise<TeamState> {
  return withTeamStateLock(statePath, async () => {
    const state = await readTeamState(statePath);
    const lane = requireLane(state, laneName);
    lane.status = 'running';
    lane.startedAt = new Date().toISOString();
    lane.error = undefined;
    await writeTeamState(statePath, state);
    return state;
  });
}

export async function markLaneCompleted(statePath: string, laneName: string): Promise<TeamState> {
  return withTeamStateLock(statePath, async () => {
    const state = await readTeamState(statePath);
    const lane = requireLane(state, laneName);
    lane.status = 'completed';
    lane.completedAt = new Date().toISOString();
    lane.error = undefined;
    await writeTeamState(statePath, state);
    return state;
  });
}

export async function markLaneFailed(statePath: string, laneName: string, error: string): Promise<TeamState> {
  return withTeamStateLock(statePath, async () => {
    const state = await readTeamState(statePath);
    const lane = requireLane(state, laneName);
    lane.status = 'failed';
    lane.completedAt = new Date().toISOString();
    lane.error = error;
    await writeTeamState(statePath, state);
    return state;
  });
}

export async function resetLanesFrom(statePath: string, laneName: string): Promise<TeamState> {
  return withTeamStateLock(statePath, async () => {
    const state = await readTeamState(statePath);
    const index = state.lanes.findIndex((lane) => lane.name === laneName);
    if (index === -1) throw new Error(`Unknown lane: ${laneName}`);
    for (let i = index; i < state.lanes.length; i += 1) {
      state.lanes[i].status = 'pending';
      state.lanes[i].startedAt = undefined;
      state.lanes[i].completedAt = undefined;
      state.lanes[i].error = undefined;
    }
    await writeTeamState(statePath, state);
    return state;
  });
}

function requireLane(state: TeamState, laneName: string): TeamLane {
  const lane = state.lanes.find((item) => item.name === laneName);
  if (!lane) throw new Error(`Unknown lane: ${laneName}`);
  return lane;
}

async function withTeamStateLock<T>(statePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = teamStateLocks.get(statePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  teamStateLocks.set(statePath, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (teamStateLocks.get(statePath) === current) {
      teamStateLocks.delete(statePath);
    }
  }
}
