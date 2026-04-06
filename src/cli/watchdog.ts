import { recoverRuntimeHealth, scanActiveRuntimeHealth } from '../runtime/watchdog.js';

export async function watchdog(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const json = args.includes('--json');
  const nudgeStalled = args.includes('--nudge-stalled');
  const resumeStalled = args.includes('--resume-stalled');
  const resumeUntracked = args.includes('--resume-untracked');
  const resume = args.includes('--resume') || nudgeStalled || resumeStalled || resumeUntracked;
  const dryRun = args.includes('--dry-run');
  const watch = args.includes('--watch');
  const intervalMs = Number(readFlagValue(args, '--interval-ms') ?? 5000);
  const stalledGraceMs = Number(readFlagValue(args, '--stalled-grace-ms') ?? 60000);
  const untrackedGraceMs = Number(readFlagValue(args, '--untracked-grace-ms') ?? 120000);

  if (watch) {
    for (;;) {
      const entries = resume
        ? await recoverRuntimeHealth(projectDir, {
          dryRun,
          nudgeStalled,
          resumeStalled,
          stalledGraceMs,
          resumeUntracked,
          untrackedGraceMs,
        })
        : await scanActiveRuntimeHealth(projectDir);
      render(entries, json);
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000));
    }
  }

  const entries = resume
    ? await recoverRuntimeHealth(projectDir, {
      dryRun,
      nudgeStalled,
      resumeStalled,
      stalledGraceMs,
      resumeUntracked,
      untrackedGraceMs,
    })
    : await scanActiveRuntimeHealth(projectDir);
  render(entries, json);
}

function render(entries: Awaited<ReturnType<typeof scanActiveRuntimeHealth>>, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }

  if (entries.length === 0) {
    process.stdout.write('# ONX Watchdog\n\n- no active watchable modes\n');
    return;
  }

  const lines = [
    '# ONX Watchdog',
    '',
    '| Mode | Job | Phase | Status | Problem | Runtime | Resumable |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of entries) {
    lines.push(
      `| ${entry.mode} | ${entry.jobDir} | ${entry.phase} | ${entry.status} | ${entry.problem} | ${entry.runtime} | ${entry.resumable ? 'yes' : 'no'} |`,
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
