import { appendManual, appendWorking, readNotepad, writePriority } from '../memory/notepad.js';

export async function note(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const section = (readFlagValue(args, '--section') ?? 'working') as 'priority' | 'working' | 'manual';
  const text = readFlagValue(args, '--text');
  const read = args.includes('--read');

  if (read) {
    process.stdout.write(await readNotepad(projectDir, section));
    if (!args.includes('--raw')) process.stdout.write('\n');
    return;
  }

  if (!text) {
    throw new Error('note requires --text <content> unless --read is used');
  }

  if (section === 'priority') {
    await writePriority(projectDir, text);
  } else if (section === 'manual') {
    await appendManual(projectDir, text);
  } else {
    await appendWorking(projectDir, text);
  }

  console.log(`Updated notepad section: ${section}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
