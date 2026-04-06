import { runFallbackWatcher } from '../runtime/fallback-watcher.js';

export async function fallbackWatcher(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const once = args.includes('--once');
  const dryRun = args.includes('--dry-run');
  const followEvents = args.includes('--follow-events');
  const nudgeStalled = args.includes('--nudge-stalled');
  const resume = args.includes('--resume');
  const resumeStalled = args.includes('--resume-stalled');
  const resumeUntracked = args.includes('--resume-untracked');
  const intervalMs = Number(readFlagValue(args, '--interval-ms') ?? 5000);
  const idleBackoffMs = Number(readFlagValue(args, '--idle-backoff-ms') ?? 15000);
  const stalledGraceMs = Number(readFlagValue(args, '--stalled-grace-ms') ?? 60000);
  const untrackedGraceMs = Number(readFlagValue(args, '--untracked-grace-ms') ?? 120000);

  await runFallbackWatcher({
    projectDir,
    once,
    dryRun,
    followEvents,
    resume,
    nudgeStalled,
    resumeStalled,
    resumeUntracked,
    intervalMs,
    idleBackoffMs,
    stalledGraceMs,
    untrackedGraceMs,
  });
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
