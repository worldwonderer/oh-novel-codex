import { resolveLatestModeJob } from '../state/mode-state.js';
import { readModeState, updateModeState } from '../state/mode-state.js';
import { executeTeamJob } from '../team/runtime.js';

export async function teamRun(args: string[]): Promise<void> {
  const explicitJobDir = readFlagValue(args, '--job');
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const latest = args.includes('--latest');
  const jobDir = explicitJobDir ?? (latest ? await resolveLatestModeJob(projectDir, 'team') : null);
  if (!jobDir) {
    throw new Error('team-run requires --job <dir> or --latest');
  }

  const codexCmd = readFlagValue(args, '--codex-cmd');
  const model = readFlagValue(args, '--model');
  const profile = readFlagValue(args, '--profile');
  const sandbox = readFlagValue(args, '--sandbox') as 'read-only' | 'workspace-write' | 'danger-full-access' | undefined;
  const dryRun = args.includes('--dry-run');
  const fromLane = readFlagValue(args, '--from');
  const toLane = readFlagValue(args, '--to');
  const force = args.includes('--force');
  const parallel = !args.includes('--serial');
  const tmuxPane = readFlagValue(args, '--tmux-pane') ?? process.env.ONX_TMUX_PANE ?? process.env.TMUX_PANE;
  const tmuxSession = readFlagValue(args, '--tmux-session') ?? process.env.ONX_TMUX_SESSION;

  if (tmuxPane || tmuxSession) {
    const existing = await readModeState(projectDir, 'team');
    await updateModeState(projectDir, 'team', {
      jobDir,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(tmuxPane ? { tmuxPane } : {}),
        ...(tmuxSession ? { tmuxSession } : {}),
      },
    });
  }

  const summary = await executeTeamJob({
    jobDir,
    codexCmd,
    model,
    profile,
    sandbox,
    dryRun,
    fromLane,
    toLane,
    force,
    parallel,
  });

  console.log(`Executed team job: ${summary.jobDir}`);
  console.log(`Lane phases: ${summary.phases.length}`);
  console.log(`Aggregate: ${summary.aggregatePath}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
