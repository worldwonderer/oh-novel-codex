import { getRevisionStatus } from '../revision/execute.js';
import { resolveLatestModeJob } from '../state/mode-state.js';

export async function revisionStatus(args: string[]): Promise<void> {
  const explicitJobDir = readFlagValue(args, '--job');
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const latest = args.includes('--latest');
  const jobDir = explicitJobDir ?? (latest ? await resolveLatestModeJob(projectDir, 'revision') : null);
  if (!jobDir) {
    throw new Error('revision-status requires --job <dir> or --latest');
  }
  process.stdout.write(await getRevisionStatus(jobDir));
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
