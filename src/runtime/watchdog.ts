import fs from 'node:fs/promises';
import path from 'node:path';
import { dispatchEvent } from '../events/dispatch.js';
import { executeReviewJob } from '../review/runner.js';
import { listModeStates } from '../state/mode-state.js';
import type { OnxModeName } from '../state/types.js';
import { readPromptRuntimeInspection, renderRuntimeSummary } from './status.js';
import { applyTmuxLayoutGuard, nudgeTmuxPane, readTmuxPaneHealth, type TmuxNudgeResult } from './tmux.js';
import { executeRevisionJob } from '../revision/execute.js';
import { readReviewState } from '../review/state.js';
import { executeTeamJob } from '../team/runtime.js';
import { executeWorkflowJob } from '../workflow/execute.js';
import { readRevisionState } from '../revision/state.js';
import { readTeamState } from '../team/state.js';
import { readWorkflowState } from '../workflow/state.js';

export type RuntimeWatchdogProblem = 'ok' | 'orphaned' | 'stalled' | 'untracked';

export type RuntimeWatchdogEntry = {
  mode: OnxModeName;
  jobDir: string;
  phase: string;
  status: string;
  problem: RuntimeWatchdogProblem;
  runtime: string;
  resumable: boolean;
  logPath?: string;
  lastMessagePath?: string;
  startedAt?: string;
  pid?: number;
  pidAlive?: boolean;
  progressAgeMs?: number;
  lastObservedAgeMs?: number;
  tmuxPane?: string;
};

export async function scanActiveRuntimeHealth(projectDir: string): Promise<RuntimeWatchdogEntry[]> {
  const states = await listModeStates(projectDir);
  const activeStates = states.filter((state) => state.active && state.jobDir && isWatchableMode(state.mode));
  const entries: RuntimeWatchdogEntry[] = [];

  for (const state of activeStates) {
    const phase = await resolveActivePhase(state.mode, state.jobDir!, state.currentPhase);
    if (!phase) continue;
    const runtimeInspection = await readPromptRuntimeInspection(phase.logPath);
    const runtime = await renderRuntimeSummary(phase.logPath);
    const problem = classifyProblem(phase.status, runtimeInspection);
    const lastObservedAgeMs = await readLastObservedAgeMs(phase.logPath, phase.lastMessagePath, phase.startedAt);
    entries.push({
      mode: state.mode,
      jobDir: state.jobDir!,
      phase: phase.name,
      status: phase.status,
      problem,
      runtime,
      resumable:
        (problem === 'orphaned' || problem === 'stalled' || problem === 'untracked')
        && (state.mode === 'workflow' || state.mode === 'review' || state.mode === 'revision' || state.mode === 'team'),
      logPath: phase.logPath,
      lastMessagePath: phase.lastMessagePath,
      startedAt: phase.startedAt,
      pid: runtimeInspection?.pid,
      pidAlive: runtimeInspection?.pidAlive,
      progressAgeMs: runtimeInspection?.progressAgeMs,
      lastObservedAgeMs,
      tmuxPane: typeof state.metadata?.tmuxPane === 'string' ? state.metadata.tmuxPane : undefined,
    });
  }

  return entries;
}

export async function recoverRuntimeHealth(
  projectDir: string,
  options: {
    dryRun?: boolean;
    resumeStalled?: boolean;
    stalledGraceMs?: number;
    resumeUntracked?: boolean;
    untrackedGraceMs?: number;
    nudgeStalled?: boolean;
  } = {},
  deps: {
    nudgeTmuxPane?: typeof nudgeTmuxPane;
    readTmuxPaneHealth?: typeof readTmuxPaneHealth;
    applyTmuxLayoutGuard?: typeof applyTmuxLayoutGuard;
  } = {},
): Promise<RuntimeWatchdogEntry[]> {
  const entries = await scanActiveRuntimeHealth(projectDir);
  await withRecoveryLock(projectDir, async () => {
    for (const entry of entries) {
      if (!entry.resumable) continue;
      const shouldRecoverOrphaned = entry.problem === 'orphaned';
      const shouldRecoverStalled =
        entry.problem === 'stalled'
        && options.resumeStalled === true
        && typeof entry.progressAgeMs === 'number'
        && entry.progressAgeMs >= (options.stalledGraceMs ?? 60_000);
      const shouldNudgeStalled =
        entry.problem === 'stalled'
        && options.nudgeStalled === true
        && typeof entry.tmuxPane === 'string'
        && typeof entry.progressAgeMs === 'number'
        && entry.progressAgeMs >= (options.stalledGraceMs ?? 60_000);
      const shouldRecoverUntracked =
        entry.problem === 'untracked'
        && options.resumeUntracked === true
        && typeof entry.lastObservedAgeMs === 'number'
        && entry.lastObservedAgeMs >= (options.untrackedGraceMs ?? 120_000);
      if (!shouldRecoverOrphaned && !shouldRecoverStalled && !shouldRecoverUntracked && !shouldNudgeStalled) continue;

      if (shouldNudgeStalled) {
        if (entry.tmuxPane && !options.dryRun) {
          const health = await (deps.readTmuxPaneHealth ?? readTmuxPaneHealth)(entry.tmuxPane);
          if (health.reason === 'pane_too_narrow' || health.reason === 'pane_too_short') {
            await (deps.applyTmuxLayoutGuard ?? applyTmuxLayoutGuard)(entry.tmuxPane);
          }
        }
        const result: TmuxNudgeResult = options.dryRun && !deps.nudgeTmuxPane
          ? { nudged: true, reason: 'dry_run' }
          : await (deps.nudgeTmuxPane ?? nudgeTmuxPane)(projectDir, {
            pane: entry.tmuxPane!,
            key: `${entry.mode}:${entry.jobDir}:${entry.phase}`,
            message: process.env.ONX_TMUX_NUDGE_MESSAGE ?? '继续当前任务；如果已完成，请立即输出最新状态。',
          });
        if (result.nudged) {
          await dispatchEvent(projectDir, {
            kind: 'runtime.watchdog.nudged',
            mode: entry.mode,
            jobDir: entry.jobDir,
            phase: entry.phase,
            payload: {
              dryRun: Boolean(options.dryRun),
              pane: entry.tmuxPane,
              result: result.reason,
            },
          });
        }
        if (result.nudged || !shouldRecoverStalled) {
          continue;
        }
      }

      if (shouldRecoverStalled && typeof entry.pid === 'number' && entry.pidAlive === true && !options.dryRun) {
        await terminateProcess(entry.pid);
      }

      if (entry.mode === 'workflow') {
        await executeWorkflowJob({ jobDir: entry.jobDir, fromPhase: entry.phase, dryRun: options.dryRun });
      } else if (entry.mode === 'review') {
        await executeReviewJob({ jobDir: entry.jobDir, fromPhase: entry.phase, dryRun: options.dryRun });
      } else if (entry.mode === 'revision') {
        await executeRevisionJob({ jobDir: entry.jobDir, fromPhase: entry.phase, dryRun: options.dryRun });
      } else if (entry.mode === 'team') {
        await executeTeamJob({
          jobDir: entry.jobDir,
          fromLane: entry.phase,
          toLane: entry.phase,
          dryRun: options.dryRun,
          parallel: false,
        });
      }

      await dispatchEvent(projectDir, {
        kind: 'runtime.watchdog.recovered',
        mode: entry.mode,
        jobDir: entry.jobDir,
        phase: entry.phase,
        payload: {
          problem: entry.problem,
          dryRun: Boolean(options.dryRun),
          resumeStalled: Boolean(options.resumeStalled),
          resumeUntracked: Boolean(options.resumeUntracked),
        },
      });
    }
  });
  return entries;
}

function isWatchableMode(mode: OnxModeName): boolean {
  return mode === 'workflow' || mode === 'review' || mode === 'revision' || mode === 'team';
}

function classifyProblem(
  phaseStatus: string,
  inspection: Awaited<ReturnType<typeof readPromptRuntimeInspection>>,
): RuntimeWatchdogProblem {
  if (phaseStatus !== 'running') return 'ok';
  if (!inspection) return 'untracked';
  if (typeof inspection.pid !== 'number') return 'orphaned';
  if (inspection.orphaned) return 'orphaned';
  if (inspection.stalled) return 'stalled';
  return 'ok';
}

async function resolveActivePhase(
  mode: OnxModeName,
  jobDir: string,
  currentPhase?: string,
): Promise<{ name: string; status: string; logPath?: string; lastMessagePath?: string; startedAt?: string } | null> {
  if (mode === 'workflow') {
    const state = await readWorkflowState(path.join(jobDir, 'runtime', 'state.json'));
    return state.phases.find((phase) => phase.name === currentPhase)
      ?? state.phases.find((phase) => phase.status === 'running')
      ?? null;
  }
  if (mode === 'review') {
    const state = await readReviewState(path.join(jobDir, 'runtime', 'state.json'));
    return state.phases.find((phase) => phase.name === currentPhase)
      ?? state.phases.find((phase) => phase.status === 'running')
      ?? null;
  }
  if (mode === 'revision') {
    const state = await readRevisionState(path.join(jobDir, 'runtime', 'state.json'));
    return state.phases.find((phase) => phase.name === currentPhase)
      ?? state.phases.find((phase) => phase.status === 'running')
      ?? null;
  }
  if (mode === 'team') {
    const state = await readTeamState(path.join(jobDir, 'runtime', 'state.json'));
    return state.lanes.find((lane) => lane.name === currentPhase)
      ?? state.lanes.find((lane) => lane.status === 'running')
      ?? null;
  }
  return null;
}

async function readLastObservedAgeMs(
  logPath?: string,
  lastMessagePath?: string,
  startedAt?: string,
): Promise<number | undefined> {
  const candidates = [logPath, lastMessagePath].filter((value): value is string => Boolean(value));
  let newestMs = Number.NaN;
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      newestMs = Number.isFinite(newestMs) ? Math.max(newestMs, stat.mtimeMs) : stat.mtimeMs;
    } catch {
      // ignore
    }
  }
  if (!Number.isFinite(newestMs) && startedAt) {
    newestMs = Date.parse(startedAt);
  }
  if (!Number.isFinite(newestMs)) return undefined;
  return Math.max(0, Date.now() - newestMs);
}

const RECOVERY_LOCK_TTL_MS = 5 * 60_000;

async function withRecoveryLock(projectDir: string, fn: () => Promise<void>): Promise<void> {
  const lockPath = path.join(projectDir, '.onx', 'state', 'watchdog-recovery.lock');
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
      if (!stale) return;
      await fs.rm(lockPath, { force: true }).catch(() => {});
    }
  }
}

async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs >= RECOVERY_LOCK_TTL_MS;
  } catch {
    return false;
  }
}

async function terminateProcess(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
