import { readTrace, summarizeTrace } from '../trace/reader.js';

export async function trace(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const last = Number(readFlagValue(args, '--last') ?? '0');
  const json = args.includes('--json');
  const summaryOnly = args.includes('--summary');

  if (summaryOnly) {
    const summary = await summarizeTrace(projectDir);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const events = await readTrace(projectDir);
  const visible = last > 0 ? events.slice(-last) : events;
  if (json) {
    process.stdout.write(`${JSON.stringify(visible, null, 2)}\n`);
    return;
  }

  const lines = ['# ONX Trace', ''];
  for (const event of visible) {
    lines.push(`- ${event.timestamp ?? ''} | ${event.kind ?? 'unknown'} | ${event.phase ?? ''}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
