import { readFallbackWatcherState } from '../runtime/fallback-watcher.js';
import { readLeaderAttentionState } from '../runtime/attention.js';
import { readTmuxPaneHealth } from '../runtime/tmux.js';
import { listModeStates } from '../state/mode-state.js';
import { readExternalTeamSummaries } from '../team/external-team-interop.js';
import { scanActiveRuntimeHealth } from '../runtime/watchdog.js';

export async function status(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const json = args.includes('--json');
  const [states, watchdog, fallbackWatcher, externalTeams, attention] = await Promise.all([
    listModeStates(projectDir),
    scanActiveRuntimeHealth(projectDir),
    readFallbackWatcherState(projectDir),
    readExternalTeamSummaries(projectDir),
    readLeaderAttentionState(projectDir),
  ]);
  const tmuxHealth = await Promise.all(
    states.map(async (state) => {
      const pane = typeof state.metadata?.tmuxPane === 'string' ? state.metadata.tmuxPane : undefined;
      if (!pane) return null;
      try {
        return {
          mode: state.mode,
          jobDir: state.jobDir,
          health: await readTmuxPaneHealth(pane),
        };
      } catch {
        return null;
      }
    }),
  );

  if (json) {
    process.stdout.write(`${JSON.stringify({ states, watchdog, fallbackWatcher, tmuxHealth: tmuxHealth.filter(Boolean), externalTeams, attention }, null, 2)}\n`);
    return;
  }

  if (states.length === 0) {
    process.stdout.write('# ONX Status\n\n- no mode state recorded yet\n');
    return;
  }

  const lines = [
    '# ONX Status',
    '',
    `- Leader attention: ${attention ? (attention.needsAttention ? 'yes' : 'no') : 'unknown'}`,
    `- Fallback watcher: ${fallbackWatcher ? `${fallbackWatcher.active ? 'active' : 'idle'}${fallbackWatcher.lastTickAt ? ` @ ${fallbackWatcher.lastTickAt}` : ''}` : 'none'}`,
    '',
    '| Mode | Status | Active | Job | Phase | Watchdog | Tmux | Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const state of states) {
    const watch = watchdog.find((entry) => entry.mode === state.mode && entry.jobDir === state.jobDir);
    const tmux = tmuxHealth.find((entry) => entry && entry.mode === state.mode && entry.jobDir === state.jobDir);
    lines.push(
      `| ${state.mode} | ${state.status} | ${state.active ? 'yes' : 'no'} | ${state.jobDir ?? ''} | ${state.currentPhase ?? ''} | ${watch ? `${watch.problem}${watch.runtime ? ` / ${watch.runtime}` : ''}` : ''} | ${tmux ? `${tmux.health.reason}${tmux.health.width ? ` ${tmux.health.width}x${tmux.health.height}` : ''}` : ''} | ${state.error ?? ''} |`,
    );
  }

  if (externalTeams.length > 0) {
    lines.push('', '## External team interop', '', '| Runtime | Team | Attention | Workers | Tasks | Leader mailbox | Worker states |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const team of externalTeams) {
      lines.push(
        `| ${team.runtimeKind} | ${team.teamName} | ${team.attentionPending ? 'yes' : 'no'} | ${team.workerCount} (dead:${team.deadWorkers}) | p:${team.taskCounts.pending} ip:${team.taskCounts.in_progress} c:${team.taskCounts.completed} f:${team.taskCounts.failed} | ${team.leaderMailbox.undelivered}/${team.leaderMailbox.total} undelivered${team.leaderMailbox.latestFrom ? ` (${team.leaderMailbox.latestFrom})` : ''} | ${Object.entries(team.workerStates).map(([k, v]) => `${k}:${v}`).join(', ')} |`,
      );
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
