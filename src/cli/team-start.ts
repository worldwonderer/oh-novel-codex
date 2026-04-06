import { createTeamJob } from '../team/runtime.js';

export async function teamStart(args: string[]): Promise<void> {
  const reviewJobDir = readFlagValue(args, '--review-job');
  const workflowJobDir = readFlagValue(args, '--workflow-job');
  const projectDir = readFlagValue(args, '--project');
  const jobName = readFlagValue(args, '--job-name');

  const team = await createTeamJob({
    reviewJobDir,
    workflowJobDir,
    projectDir,
    jobName,
  });

  console.log(`Created team job: ${team.jobDir}`);
  console.log(`Review job: ${team.reviewJobDir}`);
  console.log(`State: ${team.statePath}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
