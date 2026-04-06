import { createWorkflowJob } from '../workflow/runner.js';
import { executeWorkflowJob } from '../workflow/execute.js';

export async function runWorkflow(args: string[]): Promise<void> {
  const brief = readFlagValue(args, '--brief');
  const briefPath = readFlagValue(args, '--brief-file');
  const sourcePath = readFlagValue(args, '--source');
  const projectDir = readFlagValue(args, '--project');
  const jobName = readFlagValue(args, '--job-name');
  const mode = readFlagValue(args, '--mode') as 'draft-longform' | 'zhihu-remix' | undefined;
  const targetLength = readFlagValue(args, '--length');
  const pov = readFlagValue(args, '--pov');
  const genre = readFlagValue(args, '--genre');
  const reviewersArg = readFlagValue(args, '--reviewers');
  const reviewers = reviewersArg ? reviewersArg.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
  const execute = args.includes('--execute');
  const dryRun = args.includes('--dry-run');
  const codexCmd = readFlagValue(args, '--codex-cmd');
  const model = readFlagValue(args, '--model');
  const profile = readFlagValue(args, '--profile');
  const sandbox = readFlagValue(args, '--sandbox') as 'read-only' | 'workspace-write' | 'danger-full-access' | undefined;

  const workflow = await createWorkflowJob({
    brief,
    briefPath,
    sourcePath,
    projectDir,
    jobName,
    mode,
    targetLength,
    pov,
    genre,
    reviewers,
  });

  console.log(`Created workflow job: ${workflow.jobDir}`);
  console.log(`Draft job: ${workflow.draftJob.jobDir}`);
  console.log(`Review job: ${workflow.reviewJob.jobDir}`);
  console.log(`Runbook: ${workflow.runbookPath}`);

  if (execute) {
    const summary = await executeWorkflowJob({
      jobDir: workflow.jobDir,
      codexCmd,
      model,
      profile,
      sandbox,
      dryRun,
    });
    console.log(`Aggregate: ${summary.aggregatePath}`);
  }
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
