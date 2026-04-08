import fs from 'node:fs/promises';
import path from 'node:path';
import { scanActiveRuntimeHealth } from './watchdog.js';
import { readExternalTeamSummaries } from '../team/external-team-interop.js';

export type LeaderAttentionState = {
  updatedAt: string;
  needsAttention: boolean;
  onxWatchdogAlerts: Array<{
    mode: string;
    phase: string;
    problem: string;
    runtime: string;
  }>;
  externalTeamAlerts: Array<{
    teamName: string;
    runtimeKind: 'omx';
    deadWorkers: number;
    undeliveredLeaderMailbox: number;
    latestFrom?: string;
    latestBody?: string;
  }>;
  summary: string[];
};

export async function buildLeaderAttentionState(projectDir: string): Promise<LeaderAttentionState> {
  const [watchdog, externalTeams] = await Promise.all([
    scanActiveRuntimeHealth(projectDir),
    readExternalTeamSummaries(projectDir),
  ]);

  const onxWatchdogAlerts = watchdog
    .filter((entry) => entry.problem !== 'ok')
    .map((entry) => ({
      mode: entry.mode,
      phase: entry.phase,
      problem: entry.problem,
      runtime: entry.runtime,
    }));

  const externalTeamAlerts = externalTeams
    .filter((team) => team.attentionPending)
    .map((team) => ({
      teamName: team.teamName,
      runtimeKind: team.runtimeKind,
      deadWorkers: team.deadWorkers,
      undeliveredLeaderMailbox: team.leaderMailbox.undelivered,
      latestFrom: team.leaderMailbox.latestFrom,
      latestBody: team.leaderMailbox.latestBody,
    }));

  const summary = [
    ...onxWatchdogAlerts.map((entry) => `watchdog:${entry.mode}:${entry.phase}:${entry.problem}`),
    ...externalTeamAlerts.map((team) => `external-team:${team.runtimeKind}:${team.teamName}:dead=${team.deadWorkers}:mailbox=${team.undeliveredLeaderMailbox}`),
  ];

  return {
    updatedAt: new Date().toISOString(),
    needsAttention: onxWatchdogAlerts.length > 0 || externalTeamAlerts.length > 0,
    onxWatchdogAlerts,
    externalTeamAlerts,
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
