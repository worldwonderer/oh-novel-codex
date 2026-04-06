import { getWorkflowStatus } from '../workflow/execute.js';
import { resolveLatestModeJob } from '../state/mode-state.js';

export async function workflowStatus(args: string[]): Promise<void> {
  const explicitJobDir = readFlagValue(args, '--job');
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const latest = args.includes('--latest');
  const jobDir = explicitJobDir ?? (latest ? await resolveLatestModeJob(projectDir, 'workflow') : null);
  if (!jobDir) {
    throw new Error('workflow-status requires --job <dir> or --latest');
  }
  process.stdout.write(await getWorkflowStatus(jobDir));
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
