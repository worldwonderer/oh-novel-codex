import { listModeStates } from '../state/mode-state.js';
import { readLeaderAttentionState } from '../runtime/attention.js';
import { readFallbackWatcherState } from '../runtime/fallback-watcher.js';
import { readTmuxPaneHealth } from '../runtime/tmux.js';
import { scanActiveRuntimeHealth } from '../runtime/watchdog.js';
import { readOmxTeamSummaries } from '../team/omx-visibility.js';
import { summarizeTrace } from '../trace/reader.js';

export async function hud(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const json = args.includes('--json');

  const [states, trace, watchdog, omxTeams, attention] = await Promise.all([
    listModeStates(projectDir),
    summarizeTrace(projectDir),
    scanActiveRuntimeHealth(projectDir),
    readOmxTeamSummaries(projectDir),
    readLeaderAttentionState(projectDir),
  ]);
  const fallbackWatcher = await readFallbackWatcherState(projectDir);
  const tmuxHealth = await Promise.all(
    states.map(async (state) => {
      const pane = typeof state.metadata?.tmuxPane === 'string' ? state.metadata.tmuxPane : undefined;
      if (!pane) return null;
      try {
        return {
          mode: state.mode,
          pane,
          health: await readTmuxPaneHealth(pane),
        };
      } catch {
        return null;
      }
    }),
  );
  const summary = {
    projectDir,
    activeModes: states.filter((state) => state.active).map((state) => state.mode),
    states,
    trace,
    watchdog,
    fallbackWatcher,
    tmuxHealth: tmuxHealth.filter(Boolean),
    omxTeams,
    attention,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const lines = [
    '# ONX HUD',
    '',
    `- Project: ${projectDir}`,
    `- Active modes: ${summary.activeModes.length ? summary.activeModes.join(', ') : 'none'}`,
    `- Trace events: ${trace.count}`,
    `- Watchdog alerts: ${watchdog.filter((entry) => entry.problem !== 'ok').length}`,
    `- Leader attention: ${attention ? (attention.needsAttention ? 'yes' : 'no') : 'unknown'}`,
    `- Fallback watcher: ${fallbackWatcher ? `${fallbackWatcher.active ? 'active' : 'idle'}${fallbackWatcher.lastTickAt ? ` @ ${fallbackWatcher.lastTickAt}` : ''}` : 'none'}`,
    '',
    '| Mode | Status | Active | Phase |',
    '| --- | --- | --- | --- |',
  ];

  for (const state of states) {
    lines.push(`| ${state.mode} | ${state.status} | ${state.active ? 'yes' : 'no'} | ${state.currentPhase ?? ''} |`);
  }

  if (watchdog.length > 0) {
    lines.push('', '## Watchdog', '', '| Mode | Phase | Problem | Runtime |', '| --- | --- | --- | --- |');
    for (const entry of watchdog) {
      lines.push(`| ${entry.mode} | ${entry.phase} | ${entry.problem} | ${entry.runtime} |`);
    }
  }

  const visibleTmux = tmuxHealth.filter(Boolean);
  if (visibleTmux.length > 0) {
    lines.push('', '## Tmux', '', '| Mode | Pane | Health |', '| --- | --- | --- |');
    for (const entry of visibleTmux) {
      lines.push(`| ${entry!.mode} | ${entry!.pane} | ${entry!.health.reason}${entry!.health.width ? ` ${entry!.health.width}x${entry!.health.height}` : ''} |`);
    }
  }

  if (omxTeams.length > 0) {
    lines.push('', '## OMX Teams', '', '| Team | Attention | Tasks | Mailbox |', '| --- | --- | --- | --- |');
    for (const team of omxTeams) {
      lines.push(`| ${team.teamName} | ${team.leaderAttentionPending ? 'yes' : 'no'} | p:${team.taskCounts.pending} ip:${team.taskCounts.in_progress} c:${team.taskCounts.completed} dead:${team.deadWorkers} | ${team.leaderMailbox.undelivered}/${team.leaderMailbox.total}${team.leaderMailbox.latestFrom ? ` (${team.leaderMailbox.latestFrom})` : ''} |`);
    }
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
