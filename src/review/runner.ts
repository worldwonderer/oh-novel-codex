import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards, renderAggregatedReviewMarkdown } from './aggregate.js';
import { ensureDir, getRepoRoot } from '../utils/paths.js';
import { assertPathExists, jobTimestamp, slugifyJobName } from '../utils/job-helpers.js';
import { sliceNamedRange } from '../utils/phase-range.js';
import { updateModeState } from '../state/mode-state.js';
import { initializeReviewState, type ReviewPhase } from './state.js';
import { promptOutputsMaterialized, runCodexPromptFile } from '../runtime/codex.js';
import { renderRuntimeSummary } from '../runtime/status.js';
import type { PromptExecutor, PromptExecutionResult, SandboxMode } from '../runtime/types.js';
import { dispatchEvent } from '../events/dispatch.js';
import type { SourceOwnership } from '../draft/types.js';
import { buildStoryMemorySnapshot } from '../story-memory/store.js';

export const DEFAULT_REVIEWERS = [
  'hook-doctor',
  'character-doctor',
  'ending-killshot-reviewer',
  'remix-depth-reviewer',
  'publish-gate-reviewer',
] as const;

export type ReviewJobOptions = {
  draftPath: string;
  sourcePath?: string;
  sourceOwnership?: SourceOwnership;
  projectDir?: string;
  jobName?: string;
  reviewers?: string[];
};

export type ReviewJob = {
  jobDir: string;
  cardsDir: string;
  promptsDir: string;
  finalDir: string;
  manifestPath: string;
  statePath: string;
  reviewers: string[];
  projectDir: string;
};

export type ExecuteReviewOptions = {
  jobDir: string;
  codexCmd?: string;
  model?: string;
  profile?: string;
  sandbox?: SandboxMode;
  dryRun?: boolean;
  fromPhase?: string;
  toPhase?: string;
  force?: boolean;
  parallel?: boolean;
  executor?: PromptExecutor;
};

export async function createReviewJob(options: ReviewJobOptions): Promise<ReviewJob> {
  const repoRoot = getRepoRoot();
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const draftPath = path.resolve(options.draftPath);
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : undefined;
  const sourceOwnership: SourceOwnership = options.sourceOwnership ?? 'third-party';
  const reviewers = options.reviewers?.length ? options.reviewers : [...DEFAULT_REVIEWERS];

  await assertPathExists(draftPath, 'draft');
  if (sourcePath) await assertPathExists(sourcePath, 'source');

  const jobsRoot = path.join(projectDir, '.onx', 'reviews', 'jobs');
  const jobSlug = `${jobTimestamp()}-${slugifyJobName(options.jobName ?? path.basename(draftPath, path.extname(draftPath)), 'review-job')}`;
  const jobDir = path.join(jobsRoot, jobSlug);
  const cardsDir = path.join(jobDir, 'cards');
  const promptsDir = path.join(jobDir, 'prompts');
  const finalDir = path.join(jobDir, 'final');
  const storyMemorySnapshotPath = path.join(jobDir, 'story-memory.md');

  await ensureDir(cardsDir);
  await ensureDir(promptsDir);
  await ensureDir(finalDir);
  await fs.writeFile(storyMemorySnapshotPath, await buildStoryMemorySnapshot(projectDir), 'utf8');

  const manifest = {
    createdAt: new Date().toISOString(),
    draftPath,
    sourcePath,
    sourceOwnership,
    projectDir,
    reviewers,
    cardsDir,
    promptsDir,
    finalDir,
    storyMemorySnapshotPath,
  };

  const manifestPath = path.join(jobDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const contractPath = path.join(repoRoot, 'docs', 'review-card-contract.md');
  const templatePath = path.join(repoRoot, 'templates', 'review-card.md');

  for (const reviewer of reviewers) {
    const reviewerPrompt = buildReviewerPrompt({
      reviewer,
      draftPath,
      sourcePath,
      sourceOwnership,
      outputPath: path.join(cardsDir, `${reviewer}.md`),
      contractPath,
      templatePath,
      storyMemorySnapshotPath,
    });
    await fs.writeFile(path.join(promptsDir, `${reviewer}.md`), reviewerPrompt, 'utf8');
  }

  await fs.writeFile(
    path.join(jobDir, 'README.md'),
    buildJobReadme({ draftPath, sourcePath, sourceOwnership, reviewers, cardsDir, promptsDir, finalDir, storyMemorySnapshotPath }),
    'utf8',
  );

  const statePath = await initializeReviewState(jobDir, buildReviewPhases(jobDir, reviewers));

  await updateModeState(projectDir, 'review', {
    active: true,
    status: 'planned',
    jobDir,
    currentPhase: `review:${reviewers[0] ?? 'hook-doctor'}`,
    startedAt: new Date().toISOString(),
    metadata: {
      draftPath,
      sourcePath,
      sourceOwnership,
      reviewers,
      storyMemorySnapshotPath,
    },
  });

  await dispatchEvent(projectDir, {
    kind: 'review.job.created',
    mode: 'review',
    jobDir,
    payload: {
      draftPath,
      sourcePath,
      sourceOwnership,
      reviewers,
    },
  });

  return {
    jobDir,
    cardsDir,
    promptsDir,
    finalDir,
    manifestPath,
    statePath,
    reviewers,
    projectDir,
  };
}

export async function executeReviewJob(options: ExecuteReviewOptions): Promise<{
  jobDir: string;
  phases: PromptExecutionResult[];
  aggregatePath: string;
}> {
  const executor = options.executor ?? runCodexPromptFile;
  const jobDir = path.resolve(options.jobDir);
  const manifestPath = path.join(jobDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
    projectDir: string;
    draftPath: string;
    sourcePath?: string;
    sourceOwnership?: SourceOwnership;
    reviewers: string[];
  };
  const statePath = path.join(jobDir, 'runtime', 'state.json');
  if (options.fromPhase) {
    const { resetReviewPhasesFrom } = await import('./state.js');
    await resetReviewPhasesFrom(statePath, options.fromPhase);
  }

  const state = await (await import('./state.js')).readReviewState(statePath);
  const selected = sliceNamedRange(state.phases, options.fromPhase, options.toPhase, 'review phase');

  const promptPhases = selected.filter((phase) => phase.promptPath);
  const aggregatePhase = selected.find((phase) => phase.name === 'aggregate');

  const phases: PromptExecutionResult[] = [];
  const runPromptPhase = async (phase: ReviewPhase): Promise<PromptExecutionResult | null> => {
    if (!options.force && phase.status === 'completed') {
      return null;
    }
    if (!phase.promptPath || !phase.logPath || !phase.lastMessagePath) {
      throw new Error(`Phase ${phase.name} is missing runtime paths`);
    }
    const { markReviewPhaseRunning, markReviewPhaseCompleted, markReviewPhaseFailed } = await import('./state.js');
    if (await promptOutputsMaterialized(phase.promptPath)) {
      await markReviewPhaseCompleted(statePath, phase.name);
      await updateModeState(manifest.projectDir, 'review', {
        active: true,
        status: 'running',
        jobDir,
        currentPhase: phase.name,
      });
      return null;
    }
    await markReviewPhaseRunning(statePath, phase.name);
    await updateModeState(manifest.projectDir, 'review', {
      active: true,
      status: 'running',
      jobDir,
      currentPhase: phase.name,
    });
    await dispatchEvent(manifest.projectDir, {
      kind: 'review.phase.started',
      mode: 'review',
      jobDir,
      phase: phase.name,
    });
    try {
      const result = await executor({
        promptPath: phase.promptPath,
        projectDir: jobDir,
        logPath: phase.logPath,
        lastMessagePath: phase.lastMessagePath,
        codexCmd: options.codexCmd,
        model: options.model,
        profile: options.profile,
        sandbox: options.sandbox,
        dryRun: options.dryRun,
      });
      await markReviewPhaseCompleted(statePath, phase.name);
      await dispatchEvent(manifest.projectDir, {
        kind: 'review.phase.completed',
        mode: 'review',
        jobDir,
        phase: phase.name,
      });
      return result;
    } catch (error) {
      await markReviewPhaseFailed(statePath, phase.name, error instanceof Error ? error.message : String(error));
      await updateModeState(manifest.projectDir, 'review', {
        active: false,
        status: 'failed',
        jobDir,
        currentPhase: phase.name,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      await dispatchEvent(manifest.projectDir, {
        kind: 'review.phase.failed',
        mode: 'review',
        jobDir,
        phase: phase.name,
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  };

  if (options.parallel) {
    const results = await Promise.all(promptPhases.map(runPromptPhase));
    phases.push(...results.filter((item): item is PromptExecutionResult => item !== null));
  } else {
    for (const phase of promptPhases) {
      const result = await runPromptPhase(phase);
      if (result) phases.push(result);
    }
  }

  let aggregatePath = path.join(jobDir, 'final', 'aggregate.md');
  if (aggregatePhase) {
    const { markReviewPhaseRunning, markReviewPhaseCompleted, markReviewPhaseFailed } = await import('./state.js');
    await markReviewPhaseRunning(statePath, aggregatePhase.name);
    await dispatchEvent(manifest.projectDir, {
      kind: 'review.phase.started',
      mode: 'review',
      jobDir,
      phase: aggregatePhase.name,
    });
    try {
      aggregatePath = await aggregateReviewJob(jobDir, {
        outputPath: path.join(jobDir, 'final', 'aggregate.md'),
      });
      await markReviewPhaseCompleted(statePath, aggregatePhase.name);
      await dispatchEvent(manifest.projectDir, {
        kind: 'review.phase.completed',
        mode: 'review',
        jobDir,
        phase: aggregatePhase.name,
      });
      await updateModeState(manifest.projectDir, 'review', {
        active: false,
        status: 'completed',
        jobDir,
        currentPhase: 'aggregate',
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      await markReviewPhaseFailed(statePath, aggregatePhase.name, error instanceof Error ? error.message : String(error));
      await updateModeState(manifest.projectDir, 'review', {
        active: false,
        status: 'failed',
        jobDir,
        currentPhase: 'aggregate',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      await dispatchEvent(manifest.projectDir, {
        kind: 'review.phase.failed',
        mode: 'review',
        jobDir,
        phase: aggregatePhase.name,
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  return {
    jobDir,
    phases,
    aggregatePath,
  };
}

export async function getReviewStatus(jobDir: string): Promise<string> {
  const statePath = path.join(path.resolve(jobDir), 'runtime', 'state.json');
  const { readReviewState } = await import('./state.js');
  const state = await readReviewState(statePath);
  const lines = [
    '# ONX Review Status',
    '',
    `- Updated: ${state.updatedAt}`,
    '',
    '| Phase | Status | Started | Runtime | Error |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const phase of state.phases) {
    const runtime = await renderRuntimeSummary(phase.logPath);
    lines.push(`| ${phase.name} | ${phase.status} | ${phase.startedAt ?? ''} | ${runtime} | ${phase.error ?? ''} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function aggregateReviewJob(
  jobDir: string,
  options: { format?: 'markdown' | 'json'; outputPath?: string } = {},
): Promise<string> {
  const resolvedJobDir = path.resolve(jobDir);
  const cardsDir = path.join(resolvedJobDir, 'cards');
  await assertPathExists(cardsDir, 'review cards directory');
  const cards = await loadReviewCards(cardsDir);
  if (cards.length === 0) {
    throw new Error(`No review cards found under ${cardsDir}`);
  }

  const reviewManifest = JSON.parse(await fs.readFile(path.join(resolvedJobDir, 'manifest.json'), 'utf8')) as {
    sourceOwnership?: SourceOwnership;
  };
  const aggregate = aggregateReviewCards(cards, {
    sourceOwnership: reviewManifest.sourceOwnership ?? 'third-party',
  });
  const rendered =
    options.format === 'json'
      ? `${JSON.stringify(aggregate, null, 2)}\n`
      : renderAggregatedReviewMarkdown(aggregate);

  const outputPath =
    options.outputPath ??
    path.join(resolvedJobDir, 'final', options.format === 'json' ? 'aggregate.json' : 'aggregate.md');
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, rendered, 'utf8');
  return outputPath;
}

function buildReviewerPrompt(input: {
  reviewer: string;
  draftPath: string;
  sourcePath?: string;
  sourceOwnership: SourceOwnership;
  outputPath: string;
  contractPath: string;
  templatePath: string;
  storyMemorySnapshotPath: string;
}): string {
  const focus = reviewerFocus(input.reviewer, input.sourceOwnership);
  const ownershipInstructions =
    input.sourceOwnership === 'self-owned'
      ? [
          '- The source is author-owned / self-adapted. Do not fail solely because the new version stays close to the source.',
          '- For self-adaptation, flag source-shadow only when it makes the rewrite feel stale, redundant, or weaker in its new format.',
        ]
      : [];
  return [
    `# Review task: ${input.reviewer}`,
    '',
    `Draft: ${input.draftPath}`,
    input.sourcePath ? `Source: ${input.sourcePath}` : 'Source: none provided',
    `Source ownership: ${input.sourceOwnership}`,
    `Story memory snapshot: ${input.storyMemorySnapshotPath}`,
    `Output card: ${input.outputPath}`,
    `Contract: ${input.contractPath}`,
    `Template: ${input.templatePath}`,
    '',
    '## Instructions',
    '- Read the draft first.',
    '- Read the story memory snapshot so you can catch continuity breaks, OOC drift, world-rule violations, and voice drift when present.',
    '- If a source is provided, compare only as needed for remix-depth or rewrite originality checks.',
    ...ownershipInstructions,
    `- Focus mainly on: ${focus}.`,
    '- Write one review card that follows the ONX review card contract exactly.',
    '- Use clear P0 / P1 / P2 priorities.',
    '- Name exact sections or scenes to patch.',
    '- Prefer evidence and patch directions over vague critique.',
    '',
  ].join('\n');
}

function buildJobReadme(input: {
  draftPath: string;
  sourcePath?: string;
  sourceOwnership: SourceOwnership;
  reviewers: string[];
  cardsDir: string;
  promptsDir: string;
  finalDir: string;
  storyMemorySnapshotPath: string;
}): string {
  return [
    '# ONX review job',
    '',
    `- Draft: ${input.draftPath}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    `- Source ownership: ${input.sourceOwnership}`,
    `- Story memory snapshot: ${input.storyMemorySnapshotPath}`,
    `- Reviewers: ${input.reviewers.join(', ')}`,
    `- Reviewer prompts: ${input.promptsDir}`,
    `- Review cards: ${input.cardsDir}`,
    `- Final aggregate: ${input.finalDir}`,
    '',
    '## Next step',
    '',
    'Ask each reviewer lane to write one review card using its prompt file, then aggregate with:',
    '',
    '```bash',
    `onx review-aggregate ${path.dirname(input.cardsDir)} --output ${path.join(input.finalDir, 'aggregate.md')}`,
    '```',
    '',
  ].join('\n');
}

function buildReviewPhases(jobDir: string, reviewers: string[]): ReviewPhase[] {
  return [
    ...reviewers.map((reviewer) => ({
      name: reviewer,
      promptPath: path.join(jobDir, 'prompts', `${reviewer}.md`),
      logPath: path.join(jobDir, 'runtime', 'logs', `${reviewer}.log`),
      lastMessagePath: path.join(jobDir, 'runtime', 'logs', `${reviewer}.last.md`),
      status: 'pending' as const,
    })),
    {
      name: 'aggregate',
      status: 'pending' as const,
    },
  ];
}

function reviewerFocus(reviewer: string, sourceOwnership: SourceOwnership): string {
  switch (reviewer) {
    case 'hook-doctor':
      return 'opening pressure, chapter-end pull, and reading momentum';
    case 'character-doctor':
      return 'supporting-character depth and anti-tool-character checks';
    case 'ending-killshot-reviewer':
      return 'last-page sting, quote line, and emotional aftertaste';
    case 'remix-depth-reviewer':
      return sourceOwnership === 'self-owned'
        ? 'adaptation-upgrade depth, stale self-shadow, and whether the new version earns its new format'
        : 'skeleton remix depth, anti-retell checks, and source divergence';
    case 'publish-gate-reviewer':
      return sourceOwnership === 'self-owned'
        ? 'overall ship/no-ship readiness for an author-owned adaptation, with publishability weighted above forced distance'
        : 'overall ship/no-ship readiness and prioritized fixes';
    default:
      return 'the assigned review lane';
  }
}
