import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { isFallbackWatcherAlive, runFallbackWatcherTick } from '../runtime/fallback-watcher.js';
import type { OnxRuntimeEvent } from '../events/types.js';

type NotifyHookState = {
  updatedAt: string;
  lastEvent: OnxRuntimeEvent;
  autoWatch?: {
    enabled: boolean;
    dryRun: boolean;
    followEvents: boolean;
    resume: boolean;
    nudgeStalled: boolean;
    resumeStalled: boolean;
    resumeUntracked: boolean;
    lastTickAt?: string;
    lastReason?: string;
  };
  ensuredWatcher?: {
    enabled: boolean;
    spawned: boolean;
    watcherOnce: boolean;
    watcherDryRun: boolean;
  };
};

export async function notifyHook(args: string[]): Promise<void> {
  const input = await readStdin();
  if (!input.trim()) {
    throw new Error('notify-hook expected event JSON on stdin');
  }

  const event = JSON.parse(input) as OnxRuntimeEvent;
  const projectDir = path.resolve(readFlagValue(args, '--project') ?? event.projectDir ?? process.cwd());
  const autoWatch = args.includes('--auto-watch');
  const ensureWatcher = args.includes('--ensure-watcher');
  const dryRun = args.includes('--dry-run');
  const followEvents = args.includes('--follow-events');
  const resume = args.includes('--resume');
  const nudgeStalled = args.includes('--nudge-stalled');
  const resumeStalled = args.includes('--resume-stalled');
  const resumeUntracked = args.includes('--resume-untracked');
  const stalledGraceMs = Number(readFlagValue(args, '--stalled-grace-ms') ?? 60000);
  const untrackedGraceMs = Number(readFlagValue(args, '--untracked-grace-ms') ?? 120000);
  const watcherOnce = args.includes('--watcher-once');
  const watcherDryRun = args.includes('--watcher-dry-run');

  const state: NotifyHookState = {
    updatedAt: new Date().toISOString(),
    lastEvent: {
      ...event,
      projectDir,
    },
  };

  if (ensureWatcher) {
    const spawned = await ensureFallbackWatcherProcess(projectDir, {
      followEvents,
      resume,
      nudgeStalled,
      resumeStalled,
      resumeUntracked,
      stalledGraceMs,
      untrackedGraceMs,
      once: watcherOnce,
      dryRun: watcherDryRun,
    });
    state.ensuredWatcher = {
      enabled: true,
      spawned,
      watcherOnce,
      watcherDryRun,
    };
  } else {
    state.ensuredWatcher = {
      enabled: false,
      spawned: false,
      watcherOnce,
      watcherDryRun,
    };
  }

  if (autoWatch && !shouldSkipAutoWatch(event)) {
    const tick = await runFallbackWatcherTick({
      projectDir,
      once: true,
      dryRun,
      followEvents,
      resume,
      nudgeStalled,
      resumeStalled,
      resumeUntracked,
      stalledGraceMs,
      untrackedGraceMs,
    });
    state.autoWatch = {
      enabled: true,
      dryRun,
      followEvents,
      resume,
      nudgeStalled,
      resumeStalled,
      resumeUntracked,
      lastTickAt: tick.lastTickAt,
      lastReason: tick.lastReason,
    };
  } else {
    state.autoWatch = {
      enabled: autoWatch,
      dryRun,
      followEvents,
      resume,
      nudgeStalled,
      resumeStalled,
      resumeUntracked,
      lastReason: shouldSkipAutoWatch(event) ? 'skipped_runtime_watchdog_event' : 'disabled',
    };
  }

  await writeNotifyHookState(projectDir, state);
}

function shouldSkipAutoWatch(event: OnxRuntimeEvent): boolean {
  return event.kind === 'runtime.watchdog.recovered';
}

async function ensureFallbackWatcherProcess(
  projectDir: string,
  options: {
    followEvents: boolean;
    resume: boolean;
    nudgeStalled: boolean;
    resumeStalled: boolean;
    resumeUntracked: boolean;
    stalledGraceMs: number;
    untrackedGraceMs: number;
    once: boolean;
    dryRun: boolean;
  },
): Promise<boolean> {
  if (await isFallbackWatcherAlive(projectDir)) {
    return false;
  }

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return false;
  }

  const childArgs = [scriptPath, 'fallback-watcher', '--project', projectDir];
  if (options.followEvents) childArgs.push('--follow-events');
  if (options.resume) childArgs.push('--resume');
  if (options.nudgeStalled) childArgs.push('--nudge-stalled');
  if (options.resumeStalled) childArgs.push('--resume-stalled', '--stalled-grace-ms', String(options.stalledGraceMs));
  if (options.resumeUntracked) childArgs.push('--resume-untracked', '--untracked-grace-ms', String(options.untrackedGraceMs));
  if (options.once) childArgs.push('--once');
  if (options.dryRun) childArgs.push('--dry-run');

  const child = spawn(process.execPath, childArgs, {
    cwd: projectDir,
    detached: !options.once,
    stdio: 'ignore',
    env: process.env,
  });
  if (!options.once) {
    child.unref();
  }
  return true;
}

async function writeNotifyHookState(projectDir: string, state: NotifyHookState): Promise<void> {
  const target = path.join(projectDir, '.onx', 'state', 'notify-hook-state.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
