import { createDraftJob } from '../draft/runner.js';

export async function runDraft(args: string[]): Promise<void> {
  const brief = readFlagValue(args, '--brief');
  const briefPath = readFlagValue(args, '--brief-file');
  const sourcePath = readFlagValue(args, '--source');
  const projectDir = readFlagValue(args, '--project');
  const jobName = readFlagValue(args, '--job-name');
  const mode = readFlagValue(args, '--mode') as 'draft-longform' | 'zhihu-remix' | undefined;
  const targetLength = readFlagValue(args, '--length');
  const pov = readFlagValue(args, '--pov');
  const genre = readFlagValue(args, '--genre');

  const job = await createDraftJob({
    brief,
    briefPath,
    sourcePath,
    projectDir,
    jobName,
    mode,
    targetLength,
    pov,
    genre,
  });

  console.log(`Created draft job: ${job.jobDir}`);
  console.log(`Prompts: ${job.promptsDir}`);
  console.log(`Outputs: ${job.outputsDir}`);
  console.log(`Review handoff: ${job.handoffDir}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
