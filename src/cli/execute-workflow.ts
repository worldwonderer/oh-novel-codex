import { executeWorkflowJob } from '../workflow/execute.js';
import { readModeState, resolveLatestModeJob, updateModeState } from '../state/mode-state.js';

export async function executeWorkflow(args: string[]): Promise<void> {
  const explicitJobDir = readFlagValue(args, '--job');
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const latest = args.includes('--latest');
  const jobDir = explicitJobDir ?? (latest ? await resolveLatestModeJob(projectDir, 'workflow') : null);
  if (!jobDir) {
    throw new Error('execute-workflow requires --job <dir> or --latest');
  }

  const codexCmd = readFlagValue(args, '--codex-cmd');
  const model = readFlagValue(args, '--model');
  const profile = readFlagValue(args, '--profile');
  const sandbox = readFlagValue(args, '--sandbox') as 'read-only' | 'workspace-write' | 'danger-full-access' | undefined;
  const dryRun = args.includes('--dry-run');
  const fromPhase = readFlagValue(args, '--from');
  const toPhase = readFlagValue(args, '--to');
  const force = args.includes('--force');
  const tmuxPane = readFlagValue(args, '--tmux-pane') ?? process.env.ONX_TMUX_PANE ?? process.env.TMUX_PANE;
  const tmuxSession = readFlagValue(args, '--tmux-session') ?? process.env.ONX_TMUX_SESSION;

  if (tmuxPane || tmuxSession) {
    const existing = await readModeState(projectDir, 'workflow');
    await updateModeState(projectDir, 'workflow', {
      jobDir,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(tmuxPane ? { tmuxPane } : {}),
        ...(tmuxSession ? { tmuxSession } : {}),
      },
    });
  }

  const summary = await executeWorkflowJob({
    jobDir,
      codexCmd,
      model,
      profile,
      sandbox,
      dryRun,
    fromPhase,
    toPhase,
    force,
  });

  console.log(`Executed workflow job: ${summary.jobDir}`);
  console.log(`Draft phases: ${summary.draftPhases.length}`);
  console.log(`Review phases: ${summary.reviewPhases.length}`);
  console.log(`Aggregate: ${summary.aggregatePath}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
