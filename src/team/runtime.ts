import fs from 'node:fs/promises';
import path from 'node:path';
import { dispatchEvent } from '../events/dispatch.js';
import { promptOutputsMaterialized, runCodexPromptFile } from '../runtime/codex.js';
import { renderRuntimeSummary } from '../runtime/status.js';
import type { PromptExecutor, PromptExecutionResult, SandboxMode } from '../runtime/types.js';
import { resolveLatestModeJob, updateModeState } from '../state/mode-state.js';
import { aggregateReviewJob } from '../review/runner.js';
import { ensureDir } from '../utils/paths.js';
import { initializeTeamState, markLaneCompleted, markLaneFailed, markLaneRunning, readTeamState, resetLanesFrom } from './state.js';
import type { TeamJob, TeamLane } from './types.js';

export type CreateTeamOptions = {
  reviewJobDir?: string;
  workflowJobDir?: string;
  projectDir?: string;
  jobName?: string;
};

export type ExecuteTeamOptions = {
  jobDir: string;
  parallel?: boolean;
  dryRun?: boolean;
  fromLane?: string;
  toLane?: string;
  force?: boolean;
  codexCmd?: string;
  model?: string;
  profile?: string;
  sandbox?: SandboxMode;
  executor?: PromptExecutor;
};

export async function createTeamJob(options: CreateTeamOptions): Promise<TeamJob> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const reviewJobDir = await resolveReviewJobDir(options);
  const reviewManifest = JSON.parse(await fs.readFile(path.join(reviewJobDir, 'manifest.json'), 'utf8')) as {
    reviewers: string[];
  };

  const jobsRoot = path.join(projectDir, '.onx', 'team', 'jobs');
  const slug = `${timestamp()}-${slugify(options.jobName ?? path.basename(reviewJobDir))}`;
  const jobDir = path.join(jobsRoot, slug);
  const lanesDir = path.join(jobDir, 'lanes');
  const finalDir = path.join(jobDir, 'final');
  await ensureDir(lanesDir);
  await ensureDir(finalDir);

  const lanes = reviewManifest.reviewers.map((reviewer) => buildTeamLane(jobDir, reviewJobDir, reviewer));
  const statePath = await initializeTeamState(jobDir, lanes);

  const manifest = {
    createdAt: new Date().toISOString(),
    projectDir,
    reviewJobDir,
    lanes: reviewManifest.reviewers,
    finalDir,
  };
  const manifestPath = path.join(jobDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await fs.writeFile(
    path.join(jobDir, 'README.md'),
    [
      '# ONX team job',
      '',
      `- Review job: ${reviewJobDir}`,
      `- Lanes: ${reviewManifest.reviewers.join(', ')}`,
      `- State: ${statePath}`,
      '',
      '## Run',
      '',
      '```bash',
      `onx team-run --job "${jobDir}" --parallel --dry-run`,
      '```',
      '',
    ].join('\n'),
    'utf8',
  );

  await updateModeState(projectDir, 'team', {
    active: true,
    status: 'planned',
    jobDir,
    currentPhase: reviewManifest.reviewers[0] ?? 'aggregate',
    startedAt: new Date().toISOString(),
    metadata: {
      reviewJobDir,
      lanes: reviewManifest.reviewers,
    },
  });

  await dispatchEvent(projectDir, {
    kind: 'team.job.created',
    mode: 'team',
    jobDir,
    payload: {
      reviewJobDir,
      lanes: reviewManifest.reviewers,
    },
  });

  return {
    jobDir,
    manifestPath,
    statePath,
    reviewJobDir,
    projectDir,
  };
}

export async function executeTeamJob(options: ExecuteTeamOptions): Promise<{
  jobDir: string;
  phases: PromptExecutionResult[];
  aggregatePath: string;
}> {
  const executor = options.executor ?? runCodexPromptFile;
  const jobDir = path.resolve(options.jobDir);
  const manifest = JSON.parse(await fs.readFile(path.join(jobDir, 'manifest.json'), 'utf8')) as {
    projectDir: string;
    reviewJobDir: string;
    lanes: string[];
  };
  const statePath = path.join(jobDir, 'runtime', 'state.json');
  if (options.fromLane) {
    await resetLanesFrom(statePath, options.fromLane);
  }

  const state = await readTeamState(statePath);
  const selected = sliceLanes(state.lanes, options.fromLane, options.toLane);
  const phases: PromptExecutionResult[] = [];

  const runLane = async (lane: TeamLane): Promise<PromptExecutionResult | null> => {
    if (!options.force && lane.status === 'completed') {
      return null;
    }
    if (await promptOutputsMaterialized(lane.promptPath)) {
      await markLaneCompleted(statePath, lane.name);
      return null;
    }
    await markLaneRunning(statePath, lane.name);
    await updateModeState(manifest.projectDir, 'team', {
      active: true,
      status: 'running',
      jobDir,
      currentPhase: lane.name,
    });
    await dispatchEvent(manifest.projectDir, {
      kind: 'team.lane.started',
      mode: 'team',
      jobDir,
      phase: lane.name,
    });
    try {
      const result = await executor({
        promptPath: lane.promptPath,
        projectDir: manifest.reviewJobDir,
        logPath: lane.logPath,
        lastMessagePath: lane.lastMessagePath,
        codexCmd: options.codexCmd,
        model: options.model,
        profile: options.profile,
        sandbox: options.sandbox,
        dryRun: options.dryRun,
      });
      await markLaneCompleted(statePath, lane.name);
      await dispatchEvent(manifest.projectDir, {
        kind: 'team.lane.completed',
        mode: 'team',
        jobDir,
        phase: lane.name,
      });
      return result;
    } catch (error) {
      await markLaneFailed(statePath, lane.name, error instanceof Error ? error.message : String(error));
      await updateModeState(manifest.projectDir, 'team', {
        active: false,
        status: 'failed',
        jobDir,
        currentPhase: lane.name,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      await dispatchEvent(manifest.projectDir, {
        kind: 'team.lane.failed',
        mode: 'team',
        jobDir,
        phase: lane.name,
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await updateModeState(manifest.projectDir, 'review', {
        active: false,
        status: 'failed',
        jobDir: manifest.reviewJobDir,
        currentPhase: lane.name,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  if (options.parallel) {
    const results = await Promise.all(selected.map(runLane));
    phases.push(...results.filter((item): item is PromptExecutionResult => item !== null));
  } else {
    for (const lane of selected) {
      const result = await runLane(lane);
      if (result) phases.push(result);
    }
  }

  const finalState = await readTeamState(statePath);
  const aggregatePath = path.join(manifest.reviewJobDir, 'final', 'aggregate.md');
  const allLanesCompleted = finalState.lanes.every((lane) => lane.status === 'completed');

  if (allLanesCompleted) {
    await aggregateReviewJob(manifest.reviewJobDir, {
      outputPath: aggregatePath,
    });
    await updateModeState(manifest.projectDir, 'team', {
      active: false,
      status: 'completed',
      jobDir,
      currentPhase: 'aggregate',
      completedAt: new Date().toISOString(),
    });
    await updateModeState(manifest.projectDir, 'review', {
      active: false,
      status: 'completed',
      jobDir: manifest.reviewJobDir,
      currentPhase: 'aggregate',
      completedAt: new Date().toISOString(),
    });
  } else {
    const nextLane = finalState.lanes.find((lane) => lane.status !== 'completed')?.name ?? selected.at(-1)?.name ?? '';
    await updateModeState(manifest.projectDir, 'team', {
      active: true,
      status: 'running',
      jobDir,
      currentPhase: nextLane,
    });
    await updateModeState(manifest.projectDir, 'review', {
      active: true,
      status: 'running',
      jobDir: manifest.reviewJobDir,
      currentPhase: nextLane,
    });
  }

  return {
    jobDir,
    phases,
    aggregatePath,
  };
}

export async function getTeamStatus(jobDir: string): Promise<string> {
  const state = await readTeamState(path.join(path.resolve(jobDir), 'runtime', 'state.json'));
  const lines = [
    '# ONX Team Status',
    '',
    `- Updated: ${state.updatedAt}`,
    '',
    '| Lane | Status | Started | Runtime | Error |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const lane of state.lanes) {
    const runtime = await renderRuntimeSummary(lane.logPath);
    lines.push(`| ${lane.name} | ${lane.status} | ${lane.startedAt ?? ''} | ${runtime} | ${lane.error ?? ''} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function resolveReviewJobDir(options: CreateTeamOptions): Promise<string> {
  if (options.reviewJobDir) {
    return path.resolve(options.reviewJobDir);
  }
  if (options.workflowJobDir) {
    const manifest = JSON.parse(await fs.readFile(path.join(path.resolve(options.workflowJobDir), 'manifest.json'), 'utf8')) as {
      reviewJobDir: string;
    };
    return manifest.reviewJobDir;
  }
  const latest = await resolveLatestModeJob(options.projectDir ?? process.cwd(), 'review');
  if (!latest) throw new Error('team-start requires --review-job, --workflow-job, or an existing latest review mode');
  return latest;
}

function buildTeamLane(jobDir: string, reviewJobDir: string, reviewer: string): TeamLane {
  return {
    name: reviewer,
    promptPath: path.join(reviewJobDir, 'prompts', `${reviewer}.md`),
    logPath: path.join(jobDir, 'runtime', 'logs', `${reviewer}.log`),
    lastMessagePath: path.join(jobDir, 'runtime', 'logs', `${reviewer}.last.md`),
    status: 'pending',
  };
}

function sliceLanes(lanes: TeamLane[], fromLane?: string, toLane?: string): TeamLane[] {
  const startIndex = fromLane ? lanes.findIndex((lane) => lane.name === fromLane) : 0;
  if (startIndex === -1) throw new Error(`Unknown from lane: ${fromLane}`);
  const endIndex = toLane ? lanes.findIndex((lane) => lane.name === toLane) : lanes.length - 1;
  if (endIndex === -1) throw new Error(`Unknown to lane: ${toLane}`);
  if (endIndex < startIndex) throw new Error('to lane must come after from lane');
  return lanes.slice(startIndex, endIndex + 1);
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'team-job';
}

function timestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  const hh = `${now.getHours()}`.padStart(2, '0');
  const mi = `${now.getMinutes()}`.padStart(2, '0');
  const ss = `${now.getSeconds()}`.padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}
