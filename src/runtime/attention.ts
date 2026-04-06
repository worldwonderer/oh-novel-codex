import fs from 'node:fs/promises';
import path from 'node:path';
import { scanActiveRuntimeHealth } from './watchdog.js';
import { readOmxTeamSummaries } from '../team/omx-visibility.js';

export type LeaderAttentionState = {
  updatedAt: string;
  needsAttention: boolean;
  onxWatchdogAlerts: Array<{
    mode: string;
    phase: string;
    problem: string;
    runtime: string;
  }>;
  omxTeamAlerts: Array<{
    teamName: string;
    deadWorkers: number;
    undeliveredLeaderMailbox: number;
    latestFrom?: string;
    latestBody?: string;
  }>;
  summary: string[];
};

export async function buildLeaderAttentionState(projectDir: string): Promise<LeaderAttentionState> {
  const [watchdog, omxTeams] = await Promise.all([
    scanActiveRuntimeHealth(projectDir),
    readOmxTeamSummaries(projectDir),
  ]);

  const onxWatchdogAlerts = watchdog
    .filter((entry) => entry.problem !== 'ok')
    .map((entry) => ({
      mode: entry.mode,
      phase: entry.phase,
      problem: entry.problem,
      runtime: entry.runtime,
    }));

  const omxTeamAlerts = omxTeams
    .filter((team) => team.leaderAttentionPending)
    .map((team) => ({
      teamName: team.teamName,
      deadWorkers: team.deadWorkers,
      undeliveredLeaderMailbox: team.leaderMailbox.undelivered,
      latestFrom: team.leaderMailbox.latestFrom,
      latestBody: team.leaderMailbox.latestBody,
    }));

  const summary = [
    ...onxWatchdogAlerts.map((entry) => `watchdog:${entry.mode}:${entry.phase}:${entry.problem}`),
    ...omxTeamAlerts.map((team) => `omx-team:${team.teamName}:dead=${team.deadWorkers}:mailbox=${team.undeliveredLeaderMailbox}`),
  ];

  return {
    updatedAt: new Date().toISOString(),
    needsAttention: onxWatchdogAlerts.length > 0 || omxTeamAlerts.length > 0,
    onxWatchdogAlerts,
    omxTeamAlerts,
    summary,
  };
}

export async function writeLeaderAttentionState(projectDir: string, state: LeaderAttentionState): Promise<void> {
  const target = leaderAttentionStatePath(projectDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function readLeaderAttentionState(projectDir: string): Promise<LeaderAttentionState | null> {
  try {
    return JSON.parse(await fs.readFile(leaderAttentionStatePath(projectDir), 'utf8')) as LeaderAttentionState;
  } catch {
    return null;
  }
}

export function leaderAttentionStatePath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'state', 'leader-attention.json');
}
