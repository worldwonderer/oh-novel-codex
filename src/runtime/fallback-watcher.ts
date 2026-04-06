import fs from 'node:fs/promises';
import path from 'node:path';
import { buildLeaderAttentionState, writeLeaderAttentionState } from './attention.js';
import { recoverRuntimeHealth, scanActiveRuntimeHealth, type RuntimeWatchdogEntry } from './watchdog.js';

export type FallbackWatcherOptions = {
  projectDir: string;
  intervalMs?: number;
  idleBackoffMs?: number;
  followEvents?: boolean;
  once?: boolean;
  dryRun?: boolean;
  resume?: boolean;
  nudgeStalled?: boolean;
  resumeStalled?: boolean;
  stalledGraceMs?: number;
  resumeUntracked?: boolean;
  untrackedGraceMs?: number;
};

export type FallbackWatcherState = {
  pid?: number;
  startedAt?: string;
  updatedAt: string;
  intervalMs: number;
  once: boolean;
  dryRun: boolean;
  active: boolean;
  lastTickAt?: string;
  lastRecoveredAt?: string;
  lastEventAt?: string;
  lastEventSize?: number;
  lastReason?: string;
  leaderAttentionPending?: boolean;
  lastEntries: RuntimeWatchdogEntry[];
};

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_IDLE_BACKOFF_MS = 15_000;
const DEFAULT_LOCK_TTL_MS = 10 * 60_000;

export async function runFallbackWatcher(options: FallbackWatcherOptions): Promise<void> {
  const projectDir = path.resolve(options.projectDir);
  const intervalMs = normalizeIntervalMs(options.intervalMs);
  const idleBackoffMs = normalizeIdleBackoffMs(options.idleBackoffMs, intervalMs);
  await withWatcherLock(projectDir, async () => {
    const startedAt = new Date().toISOString();
    await writeFallbackWatcherState(projectDir, {
      pid: process.pid,
      startedAt,
      updatedAt: startedAt,
      intervalMs,
      lastReason: 'started',
      once: Boolean(options.once),
      dryRun: Boolean(options.dryRun),
      active: true,
      lastEntries: [],
    });

    try {
      do {
        const tick = await runFallbackWatcherTick(options);
        if (options.once) break;
        await writeFallbackWatcherState(projectDir, tick);
        const activeDelay = tick.lastEntries.length > 0 || tick.leaderAttentionPending ? intervalMs : idleBackoffMs;
        if (options.followEvents) {
          await waitForEventChange(projectDir, tick.lastEventAt, tick.lastEventSize, activeDelay);
        } else {
          await delay(activeDelay);
        }
      } while (true);
    } finally {
      const existing = await readFallbackWatcherState(projectDir);
      await writeFallbackWatcherState(projectDir, {
        ...(existing ?? {
          intervalMs,
          once: Boolean(options.once),
          dryRun: Boolean(options.dryRun),
          lastEntries: [],
        }),
        active: false,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

export async function runFallbackWatcherTick(options: FallbackWatcherOptions): Promise<FallbackWatcherState> {
  const projectDir = path.resolve(options.projectDir);
  const intervalMs = normalizeIntervalMs(options.intervalMs);
  const eventSnapshot = await readEventSnapshot(projectDir);
  const entries = options.resume || options.resumeStalled || options.resumeUntracked || options.nudgeStalled
    ? await recoverRuntimeHealth(projectDir, {
      dryRun: options.dryRun,
      nudgeStalled: options.nudgeStalled,
      resumeStalled: options.resumeStalled,
      stalledGraceMs: options.stalledGraceMs,
      resumeUntracked: options.resumeUntracked,
      untrackedGraceMs: options.untrackedGraceMs,
    })
    : await scanActiveRuntimeHealth(projectDir);
  const attention = await buildLeaderAttentionState(projectDir);
  await writeLeaderAttentionState(projectDir, attention);
  const recovered = entries.some((entry) => entry.resumable && isRecoverable(entry.problem, options));
  const existing = await readFallbackWatcherState(projectDir);
  const nowIso = new Date().toISOString();
  const nextState: FallbackWatcherState = {
    pid: process.pid,
    startedAt: existing?.startedAt ?? nowIso,
    updatedAt: nowIso,
    intervalMs,
      once: Boolean(options.once),
      dryRun: Boolean(options.dryRun),
      active: true,
      lastTickAt: nowIso,
      lastRecoveredAt: recovered ? nowIso : existing?.lastRecoveredAt,
      lastEventAt: eventSnapshot.lastEventAt,
      lastEventSize: eventSnapshot.lastEventSize,
      lastReason: entries.length > 0 ? 'watchable_entries' : (attention.needsAttention ? 'leader_attention_pending' : 'no_active_modes'),
      leaderAttentionPending: attention.needsAttention,
      lastEntries: entries,
    };
  await writeFallbackWatcherState(projectDir, nextState);
  return nextState;
}

export async function readFallbackWatcherState(projectDir: string): Promise<FallbackWatcherState | null> {
  try {
    const raw = await fs.readFile(fallbackWatcherStatePath(projectDir), 'utf8');
    return JSON.parse(raw) as FallbackWatcherState;
  } catch {
    return null;
  }
}

export function fallbackWatcherStatePath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'state', 'fallback-watcher.json');
}

export async function isFallbackWatcherAlive(projectDir: string): Promise<boolean> {
  const state = await readFallbackWatcherState(projectDir);
  if (!state?.active || typeof state.pid !== 'number') return false;
  try {
    process.kill(state.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function fallbackWatcherLockPath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'state', 'fallback-watcher.lock');
}

async function writeFallbackWatcherState(projectDir: string, state: FallbackWatcherState): Promise<void> {
  const target = fallbackWatcherStatePath(projectDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function withWatcherLock(projectDir: string, fn: () => Promise<void>): Promise<void> {
  const lockPath = fallbackWatcherLockPath(projectDir);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(lockPath, JSON.stringify({
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      }, null, 2), { flag: 'wx' });
      try {
        await fn();
      } finally {
        await fs.rm(lockPath, { force: true }).catch(() => {});
      }
      return;
    } catch {
      const stale = await isLockStale(lockPath);
      if (!stale) {
        throw new Error(`fallback watcher already active for ${projectDir}`);
      }
      await fs.rm(lockPath, { force: true }).catch(() => {});
    }
  }
}

async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs >= DEFAULT_LOCK_TTL_MS;
  } catch {
    return false;
  }
}

function normalizeIntervalMs(value?: number): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.max(250, Math.trunc(value as number))
    : DEFAULT_INTERVAL_MS;
}

function normalizeIdleBackoffMs(value: number | undefined, intervalMs: number): number {
  if (Number.isFinite(value) && (value as number) > 0) {
    return Math.max(intervalMs, Math.trunc(value as number));
  }
  return Math.max(DEFAULT_IDLE_BACKOFF_MS, intervalMs);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecoverable(
  problem: RuntimeWatchdogEntry['problem'],
  options: FallbackWatcherOptions,
): boolean {
  if (problem === 'orphaned') return Boolean(options.resume || options.resumeStalled || options.resumeUntracked);
  if (problem === 'stalled') return Boolean(options.resumeStalled || options.nudgeStalled);
  if (problem === 'untracked') return Boolean(options.resumeUntracked);
  return false;
}

async function waitForEventChange(
  projectDir: string,
  previousAt: string | undefined,
  previousSize: number | undefined,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + Math.max(250, timeoutMs);
  while (Date.now() < deadline) {
    const current = await readEventSnapshot(projectDir);
    if (
      current.lastEventAt !== previousAt
      || current.lastEventSize !== previousSize
    ) {
      return;
    }
    await delay(250);
  }
}

async function readEventSnapshot(projectDir: string): Promise<{ lastEventAt?: string; lastEventSize?: number }> {
  try {
    const target = path.join(path.resolve(projectDir), '.onx', 'logs', 'events.jsonl');
    const stat = await fs.stat(target);
    return {
      lastEventAt: new Date(stat.mtimeMs).toISOString(),
      lastEventSize: stat.size,
    };
  } catch {
    return {};
  }
}
