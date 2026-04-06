import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards, renderAggregatedReviewMarkdown } from './aggregate.js';
import { ensureDir, getRepoRoot } from '../utils/paths.js';
import { updateModeState } from '../state/mode-state.js';
import { initializeReviewState, type ReviewPhase } from './state.js';
import { promptOutputsMaterialized, runCodexPromptFile } from '../runtime/codex.js';
import { renderRuntimeSummary } from '../runtime/status.js';
import type { PromptExecutor, PromptExecutionResult, SandboxMode } from '../runtime/types.js';
import { dispatchEvent } from '../events/dispatch.js';

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
  const reviewers = options.reviewers?.length ? options.reviewers : [...DEFAULT_REVIEWERS];

  await assertExists(draftPath, 'draft');
  if (sourcePath) await assertExists(sourcePath, 'source');

  const jobsRoot = path.join(projectDir, '.onx', 'reviews', 'jobs');
  const jobSlug = `${timestamp()}-${slugify(options.jobName ?? path.basename(draftPath, path.extname(draftPath)))}`;
  const jobDir = path.join(jobsRoot, jobSlug);
  const cardsDir = path.join(jobDir, 'cards');
  const promptsDir = path.join(jobDir, 'prompts');
  const finalDir = path.join(jobDir, 'final');

  await ensureDir(cardsDir);
  await ensureDir(promptsDir);
  await ensureDir(finalDir);

  const manifest = {
    createdAt: new Date().toISOString(),
    draftPath,
    sourcePath,
    projectDir,
    reviewers,
    cardsDir,
    promptsDir,
    finalDir,
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
      outputPath: path.join(cardsDir, `${reviewer}.md`),
      contractPath,
      templatePath,
    });
    await fs.writeFile(path.join(promptsDir, `${reviewer}.md`), reviewerPrompt, 'utf8');
  }

  await fs.writeFile(
    path.join(jobDir, 'README.md'),
    buildJobReadme({ draftPath, sourcePath, reviewers, cardsDir, promptsDir, finalDir }),
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
      reviewers,
    },
  });

  await dispatchEvent(projectDir, {
    kind: 'review.job.created',
    mode: 'review',
    jobDir,
    payload: {
      draftPath,
      sourcePath,
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
    reviewers: string[];
  };
  const statePath = path.join(jobDir, 'runtime', 'state.json');
  if (options.fromPhase) {
    const { resetReviewPhasesFrom } = await import('./state.js');
    await resetReviewPhasesFrom(statePath, options.fromPhase);
  }

  const state = await (await import('./state.js')).readReviewState(statePath);
  const selected = sliceReviewPhases(state.phases, options.fromPhase, options.toPhase);

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
  await assertExists(cardsDir, 'review cards directory');
  const cards = await loadReviewCards(cardsDir);
  if (cards.length === 0) {
    throw new Error(`No review cards found under ${cardsDir}`);
  }

  const aggregate = aggregateReviewCards(cards);
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
  outputPath: string;
  contractPath: string;
  templatePath: string;
}): string {
  const focus = reviewerFocus(input.reviewer);
  return [
    `# Review task: ${input.reviewer}`,
    '',
    `Draft: ${input.draftPath}`,
    input.sourcePath ? `Source: ${input.sourcePath}` : 'Source: none provided',
    `Output card: ${input.outputPath}`,
    `Contract: ${input.contractPath}`,
    `Template: ${input.templatePath}`,
    '',
    '## Instructions',
    '- Read the draft first.',
    '- If a source is provided, compare only as needed for remix-depth or rewrite originality checks.',
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
  reviewers: string[];
  cardsDir: string;
  promptsDir: string;
  finalDir: string;
}): string {
  return [
    '# ONX review job',
    '',
    `- Draft: ${input.draftPath}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
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

function sliceReviewPhases(phases: ReviewPhase[], fromPhase?: string, toPhase?: string): ReviewPhase[] {
  const startIndex = fromPhase ? phases.findIndex((phase) => phase.name === fromPhase) : 0;
  if (startIndex === -1) throw new Error(`Unknown from phase: ${fromPhase}`);
  const endIndex = toPhase ? phases.findIndex((phase) => phase.name === toPhase) : phases.length - 1;
  if (endIndex === -1) throw new Error(`Unknown to phase: ${toPhase}`);
  if (endIndex < startIndex) throw new Error('to phase must come after from phase');
  return phases.slice(startIndex, endIndex + 1);
}

function reviewerFocus(reviewer: string): string {
  switch (reviewer) {
    case 'hook-doctor':
      return 'opening pressure, chapter-end pull, and reading momentum';
    case 'character-doctor':
      return 'supporting-character depth and anti-tool-character checks';
    case 'ending-killshot-reviewer':
      return 'last-page sting, quote line, and emotional aftertaste';
    case 'remix-depth-reviewer':
      return 'skeleton remix depth, anti-retell checks, and source divergence';
    case 'publish-gate-reviewer':
      return 'overall ship/no-ship readiness and prioritized fixes';
    default:
      return 'the assigned review lane';
  }
}

async function assertExists(targetPath: string, label: string): Promise<void> {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'review-job';
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
