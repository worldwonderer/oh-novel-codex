import { searchSessionHistory } from '../session-history/search.js';

export async function history(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const mode = readFlagValue(args, '--mode');
  const kind = readFlagValue(args, '--kind');
  const last = Number(readFlagValue(args, '--last') ?? '0');
  const json = args.includes('--json');
  const events = await searchSessionHistory(projectDir, {
    mode,
    kind,
    last: last > 0 ? last : undefined,
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
    return;
  }
  const lines = ['# ONX History', ''];
  for (const event of events) {
    lines.push(`- ${event.timestamp ?? ''} | ${event.kind ?? 'unknown'} | ${event.mode ?? ''} | ${event.phase ?? ''}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
