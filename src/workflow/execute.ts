import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards } from '../review/aggregate.js';
import { aggregateReviewJob, createReviewJob, executeReviewJob } from '../review/runner.js';
import { createRevisionJob } from '../revision/runner.js';
import { executeRevisionJob } from '../revision/execute.js';
import { promptOutputsMaterialized, runCodexPromptFile } from '../runtime/codex.js';
import { renderRuntimeSummary } from '../runtime/status.js';
import type { PromptExecutor, PromptExecutionResult, SandboxMode } from '../runtime/types.js';
import { updateModeState } from '../state/mode-state.js';
import { markPhaseCompleted, markPhaseFailed, markPhaseRunning, readWorkflowState, resetPhasesFrom, type WorkflowPhase } from './state.js';
import { dispatchEvent } from '../events/dispatch.js';
import { parseChineseLengthRange, verifyDraftLength } from '../verification/verifier.js';
import type { WorkflowIteration } from './types.js';

export type ExecuteWorkflowOptions = {
  jobDir: string;
  codexCmd?: string;
  model?: string;
  profile?: string;
  sandbox?: SandboxMode;
  dryRun?: boolean;
  executor?: PromptExecutor;
  fromPhase?: string;
  toPhase?: string;
  force?: boolean;
};

export type WorkflowExecutionSummary = {
  jobDir: string;
  draftPhases: PromptExecutionResult[];
  reviewPhases: PromptExecutionResult[];
  aggregatePath: string;
  qualityShip?: string;
  iterations?: WorkflowIteration[];
};

export async function executeWorkflowJob(options: ExecuteWorkflowOptions): Promise<WorkflowExecutionSummary> {
  const executor = options.executor ?? runCodexPromptFile;
  const workflowManifestPath = path.join(path.resolve(options.jobDir), 'manifest.json');
  const workflowManifest = JSON.parse(await fs.readFile(workflowManifestPath, 'utf8')) as {
    draftJobDir: string;
    reviewJobDir: string;
    draftOutputPath: string;
    projectDir: string;
    sourcePath?: string;
    qualityLoopMax?: number;
    iterations?: WorkflowIteration[];
    reviewCardsDir?: string;
    reviewFinalDir?: string;
  };
  const draftManifest = JSON.parse(
    await fs.readFile(path.join(workflowManifest.draftJobDir, 'manifest.json'), 'utf8'),
  ) as {
    sourcePath?: string;
    targetLength?: string;
    outputsDir: string;
  };
  const statePath = path.join(path.resolve(options.jobDir), 'runtime', 'state.json');
  if (options.fromPhase) {
    await resetPhasesFrom(statePath, options.fromPhase);
  }

  const state = await readWorkflowState(statePath);
  const selectedPhases = slicePhases(state.phases, options.fromPhase, options.toPhase);

  const draftPhases: PromptExecutionResult[] = [];
  const reviewPhases: PromptExecutionResult[] = [];
  let aggregatePath = path.join(workflowManifest.reviewJobDir, 'final', 'aggregate.md');
  let draftLengthVerified = false;
  let finalAggregate = null as ReturnType<typeof aggregateReviewCards> | null;
  const iterations: WorkflowIteration[] = [...(workflowManifest.iterations ?? [])];

  for (const phase of selectedPhases) {
    if (!options.force && phase.status === 'completed') {
      continue;
    }

    if (!draftLengthVerified && (phase.kind === 'review' || phase.kind === 'aggregate')) {
      const repairResults = await enforceDraftLength({
        draftJobDir: workflowManifest.draftJobDir,
        draftOutputPath: workflowManifest.draftOutputPath,
        sourcePath: draftManifest.sourcePath,
        targetLength: draftManifest.targetLength,
        executor,
        options,
      });
      draftPhases.push(...repairResults);
      draftLengthVerified = true;
    }

    if (phase.kind === 'aggregate') {
      await updateModeState(workflowManifest.projectDir, 'workflow', {
        active: true,
        status: 'running',
        jobDir: path.resolve(options.jobDir),
        currentPhase: phase.name,
      });
      await dispatchEvent(workflowManifest.projectDir, {
        kind: 'workflow.phase.started',
        mode: 'workflow',
        jobDir: path.resolve(options.jobDir),
        phase: phase.name,
      });
      await markPhaseRunning(statePath, phase.name);
      try {
        aggregatePath = await aggregateReviewJob(workflowManifest.reviewJobDir, {
          outputPath: path.join(workflowManifest.reviewJobDir, 'final', 'aggregate.md'),
        });
        finalAggregate = aggregateReviewCards(await loadReviewCards(path.join(workflowManifest.reviewJobDir, 'cards')));
        await markPhaseCompleted(statePath, phase.name);
        await dispatchEvent(workflowManifest.projectDir, {
          kind: 'workflow.phase.completed',
          mode: 'workflow',
          jobDir: path.resolve(options.jobDir),
          phase: phase.name,
        });
        await updateModeState(workflowManifest.projectDir, 'review', {
          active: false,
          status: 'completed',
          currentPhase: phase.name,
          completedAt: new Date().toISOString(),
        });
        await updateModeState(workflowManifest.projectDir, 'workflow', {
          active: false,
          status: 'completed',
          currentPhase: phase.name,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        await markPhaseFailed(statePath, phase.name, error instanceof Error ? error.message : String(error));
        await updateModeState(workflowManifest.projectDir, 'workflow', {
          active: false,
          status: 'failed',
          currentPhase: phase.name,
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
        await dispatchEvent(workflowManifest.projectDir, {
          kind: 'workflow.phase.failed',
          mode: 'workflow',
          jobDir: path.resolve(options.jobDir),
          phase: phase.name,
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
      continue;
    }

    if (!phase.promptPath || !phase.logPath || !phase.lastMessagePath) {
      throw new Error(`Phase ${phase.name} is missing prompt runtime paths`);
    }

    if (await promptOutputsMaterialized(phase.promptPath)) {
      await markPhaseCompleted(statePath, phase.name);
      await updateModeState(workflowManifest.projectDir, 'workflow', {
        active: true,
        status: 'running',
        jobDir: path.resolve(options.jobDir),
        currentPhase: phase.name,
      });
      await updateModeState(workflowManifest.projectDir, phase.kind === 'draft' ? 'draft' : 'review', {
        active: true,
        status: 'running',
        jobDir: phase.kind === 'draft' ? workflowManifest.draftJobDir : workflowManifest.reviewJobDir,
        currentPhase: phase.name,
      });
      continue;
    }

    await markPhaseRunning(statePath, phase.name);
    await updateModeState(workflowManifest.projectDir, 'workflow', {
      active: true,
      status: 'running',
      jobDir: path.resolve(options.jobDir),
      currentPhase: phase.name,
    });
    await dispatchEvent(workflowManifest.projectDir, {
      kind: 'workflow.phase.started',
      mode: 'workflow',
      jobDir: path.resolve(options.jobDir),
      phase: phase.name,
    });
    await updateModeState(workflowManifest.projectDir, phase.kind === 'draft' ? 'draft' : 'review', {
      active: true,
      status: 'running',
      jobDir: phase.kind === 'draft' ? workflowManifest.draftJobDir : workflowManifest.reviewJobDir,
      currentPhase: phase.name,
    });
    try {
      const result = await executor({
        promptPath: phase.promptPath,
        projectDir: phase.kind === 'draft' ? workflowManifest.draftJobDir : workflowManifest.reviewJobDir,
        logPath: phase.logPath,
        lastMessagePath: phase.lastMessagePath,
        codexCmd: options.codexCmd,
        model: options.model,
        profile: options.profile,
        sandbox: options.sandbox,
        dryRun: options.dryRun,
      });
      await markPhaseCompleted(statePath, phase.name);
      await dispatchEvent(workflowManifest.projectDir, {
        kind: 'workflow.phase.completed',
        mode: 'workflow',
        jobDir: path.resolve(options.jobDir),
        phase: phase.name,
      });
      await updateModeState(workflowManifest.projectDir, phase.kind === 'draft' ? 'draft' : 'review', {
        active: true,
        status: 'running',
        currentPhase: phase.name,
      });
      if (phase.kind === 'draft') {
        draftPhases.push(result);
      } else {
        reviewPhases.push(result);
      }
    } catch (error) {
      await markPhaseFailed(statePath, phase.name, error instanceof Error ? error.message : String(error));
      await updateModeState(workflowManifest.projectDir, phase.kind === 'draft' ? 'draft' : 'review', {
        active: false,
        status: 'failed',
        currentPhase: phase.name,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      await updateModeState(workflowManifest.projectDir, 'workflow', {
        active: false,
        status: 'failed',
        currentPhase: phase.name,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      await dispatchEvent(workflowManifest.projectDir, {
        kind: 'workflow.phase.failed',
        mode: 'workflow',
        jobDir: path.resolve(options.jobDir),
        phase: phase.name,
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  const finalState = await readWorkflowState(statePath);
  if (finalState.phases.filter((phase) => phase.kind === 'draft').every((phase) => phase.status === 'completed')) {
    await updateModeState(workflowManifest.projectDir, 'draft', {
      active: false,
      status: 'completed',
      currentPhase: 'draft:04-review-handoff',
      completedAt: new Date().toISOString(),
    });
  }
  if (finalState.phases.filter((phase) => phase.kind === 'review').every((phase) => phase.status === 'completed')) {
    await updateModeState(workflowManifest.projectDir, 'review', {
      active: false,
      status: 'completed',
      currentPhase: 'review:publish-gate-reviewer',
      completedAt: new Date().toISOString(),
    });
  }

  if (finalAggregate && finalAggregate.qualityShip !== 'ship') {
    const loopMax = workflowManifest.qualityLoopMax ?? 2;
    let loopCount = 0;
    let currentDraftPath = workflowManifest.draftOutputPath;
    let currentReviewJobDir = workflowManifest.reviewJobDir;

    while (finalAggregate.qualityShip !== 'ship' && loopCount < loopMax) {
      loopCount += 1;
      const revisionJob = await createRevisionJob({
        draftPath: currentDraftPath,
        reviewJobDir: currentReviewJobDir,
        projectDir: workflowManifest.projectDir,
        focus: 'quality',
        jobName: `${path.basename(currentDraftPath, path.extname(currentDraftPath))}-quality-loop-${loopCount}`,
      });
      await executeRevisionJob({
        jobDir: revisionJob.jobDir,
        codexCmd: options.codexCmd,
        model: options.model,
        profile: options.profile,
        sandbox: options.sandbox,
        dryRun: options.dryRun,
      });
      currentDraftPath = path.join(revisionJob.outputsDir, 'revised-draft.md');

      const reviewJob = await createReviewJob({
        draftPath: currentDraftPath,
        sourcePath: workflowManifest.sourcePath ?? draftManifest.sourcePath,
        projectDir: workflowManifest.projectDir,
        jobName: `${path.basename(currentDraftPath, path.extname(currentDraftPath))}-review-loop-${loopCount}`,
      });
      await executeReviewJob({
        jobDir: reviewJob.jobDir,
        codexCmd: options.codexCmd,
        model: options.model,
        profile: options.profile,
        sandbox: options.sandbox,
        dryRun: options.dryRun,
      });

      currentReviewJobDir = reviewJob.jobDir;
      aggregatePath = await aggregateReviewJob(currentReviewJobDir, {
        outputPath: path.join(reviewJob.finalDir, 'aggregate.md'),
      });
      finalAggregate = aggregateReviewCards(await loadReviewCards(path.join(currentReviewJobDir, 'cards')));
      iterations.push({
        stage: 'revision',
        draftPath: currentDraftPath,
        reviewJobDir: currentReviewJobDir,
        aggregatePath,
        revisionJobDir: revisionJob.jobDir,
      });
    }

    workflowManifest.iterations = iterations;
    workflowManifest.reviewJobDir = currentReviewJobDir;
    workflowManifest.reviewCardsDir = path.join(currentReviewJobDir, 'cards');
    workflowManifest.reviewFinalDir = path.join(currentReviewJobDir, 'final');
    workflowManifest.draftOutputPath = currentDraftPath;
    await fs.writeFile(workflowManifestPath, `${JSON.stringify(workflowManifest, null, 2)}\n`, 'utf8');

    if (finalAggregate.qualityShip !== 'ship') {
      throw new Error(`Workflow quality loop exhausted without ship verdict (final quality ship: ${finalAggregate.qualityShip})`);
    }
  }

  return {
    jobDir: path.resolve(options.jobDir),
    draftPhases,
    reviewPhases,
    aggregatePath,
    qualityShip: finalAggregate?.qualityShip,
    iterations,
  };
}

async function enforceDraftLength(input: {
  draftJobDir: string;
  draftOutputPath: string;
  sourcePath?: string;
  targetLength?: string;
  executor: PromptExecutor;
  options: ExecuteWorkflowOptions;
}): Promise<PromptExecutionResult[]> {
  const { minChars, maxChars } = parseChineseLengthRange(input.targetLength);
  const results: PromptExecutionResult[] = [];
  let verification = await verifyDraftLength(input.draftOutputPath, minChars, maxChars);
  let attempt = 0;

  while (!verification.ok && verification.chineseChars < minChars && attempt < 3) {
    attempt += 1;
    const promptPath = path.join(input.draftJobDir, 'runtime', 'repair-prompts', `length-repair-${attempt}.md`);
    await fs.mkdir(path.dirname(promptPath), { recursive: true });
    await fs.writeFile(
      promptPath,
      buildLengthRepairPrompt({
        draftPath: input.draftOutputPath,
        sourcePath: input.sourcePath,
        minChars,
        maxChars,
        currentChars: verification.chineseChars,
      }),
      'utf8',
    );

    const result = await input.executor({
      promptPath,
      projectDir: input.draftJobDir,
      logPath: path.join(input.draftJobDir, 'runtime', 'logs', `length-repair-${attempt}.log`),
      lastMessagePath: path.join(input.draftJobDir, 'runtime', 'logs', `length-repair-${attempt}.last.md`),
      codexCmd: input.options.codexCmd,
      model: input.options.model,
      profile: input.options.profile,
      sandbox: input.options.sandbox,
      dryRun: input.options.dryRun,
    });
    results.push(result);
    verification = await verifyDraftLength(input.draftOutputPath, minChars, maxChars);
  }

  if (!verification.ok) {
    throw new Error(
      `Draft length gate failed: ${verification.chineseChars} Chinese chars (target ${minChars}-${maxChars})`,
    );
  }

  return results;
}

function buildLengthRepairPrompt(input: {
  draftPath: string;
  sourcePath?: string;
  minChars: number;
  maxChars: number;
  currentChars: number;
}): string {
  return [
    '# Draft task: length-repair',
    '',
    `Current draft: ${input.draftPath}`,
    input.sourcePath ? `Source: ${input.sourcePath}` : 'Source: none',
    `Write finished draft to: ${input.draftPath}`,
    '',
    '## Instructions',
    `- The current draft is too short: ${input.currentChars} Chinese characters.`,
    `- Expand it to ${input.minChars}-${input.maxChars} Chinese characters.`,
    '- Do not rewrite into outline form.',
    '- Add real scenes, stronger middle pressure, clearer consequence chain, and a heavier ending payoff.',
    '- Do not pad with summary paragraphs or repeated emotions.',
    '- Keep the existing direction, POV, and structure, but deepen it until the length gate is satisfied.',
    '',
  ].join('\n');
}

function slicePhases(phases: WorkflowPhase[], fromPhase?: string, toPhase?: string): WorkflowPhase[] {
  const startIndex = fromPhase ? phases.findIndex((phase) => phase.name === fromPhase) : 0;
  if (startIndex === -1) throw new Error(`Unknown from phase: ${fromPhase}`);
  const endIndex = toPhase ? phases.findIndex((phase) => phase.name === toPhase) : phases.length - 1;
  if (endIndex === -1) throw new Error(`Unknown to phase: ${toPhase}`);
  if (endIndex < startIndex) throw new Error('to phase must come after from phase');
  return phases.slice(startIndex, endIndex + 1);
}

export async function getWorkflowStatus(jobDir: string): Promise<string> {
  const statePath = path.join(path.resolve(jobDir), 'runtime', 'state.json');
  const state = await readWorkflowState(statePath);
  const lines = [
    '# ONX Workflow Status',
    '',
    `- Updated: ${state.updatedAt}`,
    '',
    '| Phase | Kind | Status | Started | Runtime | Error |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const phase of state.phases) {
    const runtime = await renderRuntimeSummary(phase.logPath);
    lines.push(`| ${phase.name} | ${phase.kind} | ${phase.status} | ${phase.startedAt ?? ''} | ${runtime} | ${phase.error ?? ''} |`);
  }
  return `${lines.join('\n')}\n`;
}
