import fs from 'node:fs/promises';
import path from 'node:path';

export type OmxTeamSummary = {
  teamName: string;
  workerCount: number;
  deadWorkers: number;
  taskCounts: {
    total: number;
    pending: number;
    blocked: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  leaderMailbox: {
    total: number;
    undelivered: number;
    latestFrom?: string;
    latestBody?: string;
  };
  workerStates: Record<string, number>;
  leaderAttentionPending: boolean;
};

export async function readOmxTeamSummaries(projectDir: string): Promise<OmxTeamSummary[]> {
  const teamsRoot = path.join(path.resolve(projectDir), '.omx', 'state', 'team');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(teamsRoot);
  } catch {
    return [];
  }

  const summaries = await Promise.all(entries.map(async (entry) => {
    const teamDir = path.join(teamsRoot, entry);
    try {
      const stat = await fs.stat(teamDir);
      if (!stat.isDirectory()) return null;
      return await readOneTeamSummary(teamDir, entry);
    } catch {
      return null;
    }
  }));

  return summaries.filter((item): item is OmxTeamSummary => item !== null);
}

async function readOneTeamSummary(teamDir: string, fallbackName: string): Promise<OmxTeamSummary> {
  const config = await readJson(path.join(teamDir, 'config.json'));
  const teamName = typeof config?.name === 'string' ? config.name : fallbackName;
  const workerCount = Array.isArray(config?.workers) ? config.workers.length : 0;

  const taskCounts = {
    total: 0,
    pending: 0,
    blocked: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
  };
  try {
    const tasksDir = path.join(teamDir, 'tasks');
    const taskFiles = await fs.readdir(tasksDir);
    for (const file of taskFiles) {
      const task = await readJson(path.join(tasksDir, file));
      const status = typeof task?.status === 'string' ? task.status : 'pending';
      taskCounts.total += 1;
      if (status in taskCounts) {
        // @ts-expect-error dynamic keyed counter
        taskCounts[status] += 1;
      }
    }
  } catch {
    // ignore
  }

  let leaderMailboxTotal = 0;
  let leaderMailboxUndelivered = 0;
  let leaderMailboxLatestFrom = '';
  let leaderMailboxLatestBody = '';
  const leaderMailbox = await readJson(path.join(teamDir, 'mailbox', 'leader-fixed.json'));
  if (Array.isArray(leaderMailbox?.messages)) {
    leaderMailboxTotal = leaderMailbox.messages.length;
    leaderMailboxUndelivered = leaderMailbox.messages.filter((message: Record<string, unknown>) => !message.delivered_at).length;
    const latest = leaderMailbox.messages.at(-1);
    leaderMailboxLatestFrom = typeof latest?.from_worker === 'string' ? latest.from_worker : '';
    leaderMailboxLatestBody = typeof latest?.body === 'string' ? latest.body.slice(0, 120) : '';
  }

  const workerStates: Record<string, number> = {};
  let deadWorkers = 0;
  try {
    const workersDir = path.join(teamDir, 'workers');
    const workers = await fs.readdir(workersDir);
    for (const workerName of workers) {
      const status = await readJson(path.join(workersDir, workerName, 'status.json'));
      const state = typeof status?.state === 'string' ? status.state : 'unknown';
      workerStates[state] = (workerStates[state] ?? 0) + 1;
    }
  } catch {
    // ignore
  }

  const snapshot = await readJson(path.join(teamDir, 'monitor-snapshot.json'));
  if (snapshot?.workerAliveByName && typeof snapshot.workerAliveByName === 'object') {
    deadWorkers = Object.values(snapshot.workerAliveByName).filter((alive) => alive === false).length;
  }

  return {
    teamName,
    workerCount,
    deadWorkers,
    taskCounts,
    leaderMailbox: {
      total: leaderMailboxTotal,
      undelivered: leaderMailboxUndelivered,
      latestFrom: leaderMailboxLatestFrom || undefined,
      latestBody: leaderMailboxLatestBody || undefined,
    },
    workerStates,
    leaderAttentionPending: leaderMailboxUndelivered > 0 || taskCounts.blocked > 0 || deadWorkers > 0,
  };
}

async function readJson(filePath: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, any>;
  } catch {
    return null;
  }
}
