import fs from 'node:fs/promises';
import { deriveRuntimeStatePath } from './codex.js';
import type { PromptRuntimeState } from './types.js';

export type PromptRuntimeInspection = PromptRuntimeState & {
  pidAlive?: boolean;
  progressAgeMs?: number;
  stalled?: boolean;
  orphaned?: boolean;
};

export async function readPromptRuntimeInspection(logPath?: string): Promise<PromptRuntimeInspection | null> {
  if (!logPath) return null;
  try {
    const raw = await fs.readFile(deriveRuntimeStatePath(logPath), 'utf8');
    const state = JSON.parse(raw) as PromptRuntimeState;
    const pidAlive = typeof state.pid === 'number' ? isProcessAlive(state.pid) : undefined;
    const lastProgressMs = state.lastProgressAt ? Date.parse(state.lastProgressAt) : Number.NaN;
    const progressAgeMs = Number.isFinite(lastProgressMs) ? Math.max(0, Date.now() - lastProgressMs) : undefined;
    const stalled =
      state.status === 'running'
      && typeof progressAgeMs === 'number'
      && typeof state.stallTimeoutMs === 'number'
      && state.stallTimeoutMs > 0
      && progressAgeMs > state.stallTimeoutMs;
    const orphaned = state.status === 'running' && typeof state.pid === 'number' && pidAlive === false;
    return {
      ...state,
      pidAlive,
      progressAgeMs,
      stalled,
      orphaned,
    };
  } catch {
    return null;
  }
}

export async function renderRuntimeSummary(logPath?: string): Promise<string> {
  const inspection = await readPromptRuntimeInspection(logPath);
  if (!inspection) return '';
  const attempt = inspection.attempt > 0 ? `a${inspection.attempt}` : '';
  if (inspection.status === 'completed') {
    return compact(`done ${inspection.completionReason ?? 'process-exit'} ${attempt}`);
  }
  if (inspection.status === 'failed') {
    return compact(`failed ${attempt}`);
  }
  if (inspection.orphaned) {
    return compact(`orphaned pid:${inspection.pid ?? '?'} ${attempt}`);
  }
  if (inspection.stalled) {
    return compact(`stalled ${formatDuration(inspection.progressAgeMs)} ${attempt}`);
  }
  return compact(`running ${formatDuration(inspection.progressAgeMs)} ${attempt}`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
