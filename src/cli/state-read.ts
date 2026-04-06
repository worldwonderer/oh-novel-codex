import { readModeState } from '../state/mode-state.js';

export async function stateRead(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const mode = readFlagValue(args, '--mode') as
    | 'interview'
    | 'architect'
    | 'draft'
    | 'review'
    | 'workflow'
    | 'publish'
    | 'team'
    | undefined;
  if (!mode) {
    throw new Error('state-read requires --mode <name>');
  }
  const state = await readModeState(projectDir, mode);
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
