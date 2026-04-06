import { verifyDraftJob, verifyReviewJob, verifyWorkflowJob } from '../verification/verifier.js';

export async function verifyJob(args: string[]): Promise<void> {
  const kind = readFlagValue(args, '--kind');
  const jobDir = readFlagValue(args, '--job');
  if (!kind || !jobDir) {
    throw new Error('verify-job requires --kind draft|review|workflow and --job <dir>');
  }

  const result =
    kind === 'draft'
      ? await verifyDraftJob(jobDir)
      : kind === 'review'
        ? await verifyReviewJob(jobDir)
        : kind === 'workflow'
          ? await verifyWorkflowJob(jobDir)
          : null;

  if (!result) {
    throw new Error('verify-job kind must be draft, review, or workflow');
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
