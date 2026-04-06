import path from 'node:path';
import { aggregateReviewJob, createReviewJob, executeReviewJob } from '../review/runner.js';

export async function runReview(args: string[]): Promise<void> {
  const draft = readFlagValue(args, '--draft');
  const source = readFlagValue(args, '--source');
  const projectDir = readFlagValue(args, '--project');
  const jobDir = readFlagValue(args, '--job');
  const jobName = readFlagValue(args, '--job-name');
  const output = readFlagValue(args, '--output');
  const format = (readFlagValue(args, '--format') ?? 'markdown') as 'markdown' | 'json';
  const aggregate = args.includes('--aggregate');
  const execute = args.includes('--execute');
  const reviewersArg = readFlagValue(args, '--reviewers');
  const reviewers = reviewersArg ? reviewersArg.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
  const dryRun = args.includes('--dry-run');
  const fromPhase = readFlagValue(args, '--from');
  const toPhase = readFlagValue(args, '--to');
  const force = args.includes('--force');
  const parallel = args.includes('--parallel');
  const codexCmd = readFlagValue(args, '--codex-cmd');
  const model = readFlagValue(args, '--model');
  const profile = readFlagValue(args, '--profile');
  const sandbox = readFlagValue(args, '--sandbox') as 'read-only' | 'workspace-write' | 'danger-full-access' | undefined;

  if (jobDir && aggregate) {
    const target = await aggregateReviewJob(jobDir, {
      format,
      outputPath: output ? path.resolve(output) : undefined,
    });
    console.log(`Aggregated review cards into ${target}`);
    return;
  }

  if (!draft) {
    throw new Error('run-review requires --draft <path> unless --job <dir> --aggregate is used');
  }

  const job = await createReviewJob({
    draftPath: draft,
    sourcePath: source,
    projectDir,
    jobName,
    reviewers,
  });

  console.log(`Created review job: ${job.jobDir}`);
  console.log(`Reviewer prompts: ${job.promptsDir}`);
  console.log(`Review cards: ${job.cardsDir}`);
  console.log(`Final aggregate directory: ${job.finalDir}`);

  if (execute) {
    const summary = await executeReviewJob({
      jobDir: job.jobDir,
      codexCmd,
      model,
      profile,
      sandbox,
      dryRun,
      fromPhase,
      toPhase,
      force,
      parallel,
    });
    console.log(`Aggregate: ${summary.aggregatePath}`);
  } else if (aggregate) {
    const target = await aggregateReviewJob(job.jobDir, {
      format,
      outputPath: output ? path.resolve(output) : undefined,
    });
    console.log(`Aggregated review cards into ${target}`);
  }
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
