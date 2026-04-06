import { getReviewStatus } from '../review/runner.js';
import { resolveLatestModeJob } from '../state/mode-state.js';

export async function reviewStatus(args: string[]): Promise<void> {
  const explicitJobDir = readFlagValue(args, '--job');
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const latest = args.includes('--latest');
  const jobDir = explicitJobDir ?? (latest ? await resolveLatestModeJob(projectDir, 'review') : null);
  if (!jobDir) {
    throw new Error('review-status requires --job <dir> or --latest');
  }
  process.stdout.write(await getReviewStatus(jobDir));
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
