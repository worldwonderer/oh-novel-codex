import fs from 'node:fs/promises';
import path from 'node:path';
import type { OnxModeName, OnxModeState, OnxModeStatus } from './types.js';

const MODE_NAMES: OnxModeName[] = ['interview', 'architect', 'draft', 'review', 'revision', 'workflow', 'publish', 'team'];
const modeStateLocks = new Map<string, Promise<void>>();

export async function updateModeState(
  projectDir: string,
  mode: OnxModeName,
  patch: Partial<OnxModeState>,
): Promise<OnxModeState> {
  const target = modeStatePath(projectDir, mode);
  return withModeStateLock(target, async () => {
    const existing = (await readModeState(projectDir, mode)) ?? {
      mode,
      active: false,
      status: 'idle' as OnxModeStatus,
      updatedAt: new Date().toISOString(),
    };
    const next: OnxModeState = {
      ...existing,
      ...patch,
      mode,
      updatedAt: new Date().toISOString(),
    };
    await writeModeState(projectDir, next);
    return next;
  });
}

export async function readModeState(projectDir: string, mode: OnxModeName): Promise<OnxModeState | null> {
  const target = modeStatePath(projectDir, mode);
  try {
    const raw = await fs.readFile(target, 'utf8');
    return JSON.parse(raw) as OnxModeState;
  } catch {
    return null;
  }
}

export async function listModeStates(projectDir: string): Promise<OnxModeState[]> {
  const states = await Promise.all(MODE_NAMES.map((mode) => readModeState(projectDir, mode)));
  return states.filter((state): state is OnxModeState => state !== null);
}

export async function resolveLatestModeJob(projectDir: string, mode: OnxModeName): Promise<string | null> {
  const state = await readModeState(projectDir, mode);
  return state?.jobDir ?? null;
}

export async function clearModeState(projectDir: string, mode: OnxModeName): Promise<void> {
  await fs.rm(modeStatePath(projectDir, mode), { force: true });
}

export async function writeModeState(projectDir: string, state: OnxModeState): Promise<void> {
  const target = modeStatePath(projectDir, state.mode);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function modeStatePath(projectDir: string, mode: OnxModeName): string {
  return path.join(path.resolve(projectDir), '.onx', 'state', 'modes', `${mode}.json`);
}

async function withModeStateLock<T>(statePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = modeStateLocks.get(statePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  modeStateLocks.set(statePath, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (modeStateLocks.get(statePath) === current) {
      modeStateLocks.delete(statePath);
    }
  }
}
