import { createRevisionJob } from '../revision/runner.js';

export async function runRevision(args: string[]): Promise<void> {
  const draftPath = readFlagValue(args, '--draft');
  const reviewJobDir = readFlagValue(args, '--review-job');
  const projectDir = readFlagValue(args, '--project');
  const jobName = readFlagValue(args, '--job-name');
  const focus = (readFlagValue(args, '--focus') ?? 'quality') as 'quality' | 'all' | 'originality';

  if (!draftPath || !reviewJobDir) {
    throw new Error('run-revision requires --draft <file> and --review-job <dir>');
  }

  const revision = await createRevisionJob({
    draftPath,
    reviewJobDir,
    projectDir,
    jobName,
    focus,
  });

  console.log(`Created revision job: ${revision.jobDir}`);
  console.log(`Prompts: ${revision.promptsDir}`);
  console.log(`Outputs: ${revision.outputsDir}`);
  console.log(`Handoff: ${revision.handoffDir}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
