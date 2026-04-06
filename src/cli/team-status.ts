import { resolveLatestModeJob } from '../state/mode-state.js';
import { getTeamStatus } from '../team/runtime.js';

export async function teamStatus(args: string[]): Promise<void> {
  const explicitJobDir = readFlagValue(args, '--job');
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const latest = args.includes('--latest');
  const jobDir = explicitJobDir ?? (latest ? await resolveLatestModeJob(projectDir, 'team') : null);
  if (!jobDir) {
    throw new Error('team-status requires --job <dir> or --latest');
  }
  process.stdout.write(await getTeamStatus(jobDir));
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
