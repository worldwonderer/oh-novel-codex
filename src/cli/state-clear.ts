import { clearModeState } from '../state/mode-state.js';

export async function stateClear(args: string[]): Promise<void> {
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
    throw new Error('state-clear requires --mode <name>');
  }
  await clearModeState(projectDir, mode);
  console.log(`Cleared mode state: ${mode}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
