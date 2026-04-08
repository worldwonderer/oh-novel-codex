import fs from 'node:fs/promises';
import path from 'node:path';
import { dispatchEvent } from '../events/dispatch.js';
import { promptOutputsMaterialized, runCodexPromptFile } from '../runtime/codex.js';
import { renderRuntimeSummary } from '../runtime/status.js';
import type { PromptExecutor, PromptExecutionResult, SandboxMode } from '../runtime/types.js';
import { updateModeState } from '../state/mode-state.js';
import { sliceNamedRange } from '../utils/phase-range.js';
import { initializeRevisionState, markRevisionPhaseCompleted, markRevisionPhaseFailed, markRevisionPhaseRunning, readRevisionState, resetRevisionPhasesFrom, type RevisionPhase } from './state.js';
import { verifyDraftLength } from '../verification/verifier.js';

export type ExecuteRevisionOptions = {
  jobDir: string;
  codexCmd?: string;
  model?: string;
  profile?: string;
  sandbox?: SandboxMode;
  dryRun?: boolean;
  fromPhase?: string;
  toPhase?: string;
  force?: boolean;
  executor?: PromptExecutor;
};

export async function executeRevisionJob(options: ExecuteRevisionOptions): Promise<{
  jobDir: string;
  phases: PromptExecutionResult[];
}> {
  const executor = options.executor ?? runCodexPromptFile;
  const jobDir = path.resolve(options.jobDir);
  const manifest = JSON.parse(await fs.readFile(path.join(jobDir, 'manifest.json'), 'utf8')) as {
    projectDir: string;
    draftChineseChars?: number;
  };
  const statePath = path.join(jobDir, 'runtime', 'state.json');
  if (!(await exists(statePath))) {
    await initializeRevisionState(jobDir, buildRevisionPhases(jobDir));
  }
  if (options.fromPhase) {
    await resetRevisionPhasesFrom(statePath, options.fromPhase);
  }
  const state = await readRevisionState(statePath);
  const selected = sliceNamedRange(state.phases, options.fromPhase, options.toPhase, 'revision phase');
  const phases: PromptExecutionResult[] = [];

  for (const phase of selected) {
    if (!options.force && phase.status === 'completed') continue;
    if (!phase.promptPath || !phase.logPath || !phase.lastMessagePath) {
      throw new Error(`Revision phase ${phase.name} is missing runtime paths`);
    }
    if (await promptOutputsMaterialized(phase.promptPath)) {
      await markRevisionPhaseCompleted(statePath, phase.name);
      await updateModeState(manifest.projectDir, 'revision', {
        active: true,
        status: 'running',
        jobDir,
        currentPhase: phase.name,
      });
      continue;
    }
    await markRevisionPhaseRunning(statePath, phase.name);
    await updateModeState(manifest.projectDir, 'revision', {
      active: true,
      status: 'running',
      jobDir,
      currentPhase: phase.name,
      startedAt: new Date().toISOString(),
    });
    await dispatchEvent(manifest.projectDir, {
      kind: 'workflow.phase.started',
      mode: 'revision',
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
      phases.push(result);
      await markRevisionPhaseCompleted(statePath, phase.name);
      await dispatchEvent(manifest.projectDir, {
        kind: 'workflow.phase.completed',
        mode: 'revision',
        jobDir,
        phase: phase.name,
      });
    } catch (error) {
      await markRevisionPhaseFailed(statePath, phase.name, error instanceof Error ? error.message : String(error));
      await updateModeState(manifest.projectDir, 'revision', {
        active: false,
        status: 'failed',
        jobDir,
        currentPhase: phase.name,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const revisedDraftPath = path.join(jobDir, 'outputs', 'revised-draft.md');
  const minChars = Math.max(8000, Math.floor((manifest.draftChineseChars ?? 8000) * 0.95));
  const maxChars = 12000;
  let verification = await verifyDraftLength(revisedDraftPath, minChars, maxChars);
  let attempt = 0;
  while (!verification.ok && verification.chineseChars < minChars && attempt < 3) {
    attempt += 1;
    const promptPath = path.join(jobDir, 'runtime', 'repair-prompts', `length-repair-${attempt}.md`);
    await fs.mkdir(path.dirname(promptPath), { recursive: true });
    await fs.writeFile(
      promptPath,
      buildRevisionLengthRepairPrompt({
        draftPath: revisedDraftPath,
        currentChars: verification.chineseChars,
        minChars,
        maxChars,
      }),
      'utf8',
    );
    const result = await executor({
      promptPath,
      projectDir: jobDir,
      logPath: path.join(jobDir, 'runtime', 'logs', `length-repair-${attempt}.log`),
      lastMessagePath: path.join(jobDir, 'runtime', 'logs', `length-repair-${attempt}.last.md`),
      codexCmd: options.codexCmd,
      model: options.model,
      profile: options.profile,
      sandbox: options.sandbox,
      dryRun: options.dryRun,
    });
    phases.push(result);
    verification = await verifyDraftLength(revisedDraftPath, minChars, maxChars);
  }

  if (!verification.ok) {
    await updateModeState(manifest.projectDir, 'revision', {
      active: false,
      status: 'failed',
      jobDir,
      currentPhase: 'length-repair',
      completedAt: new Date().toISOString(),
      error: `Revision length gate failed: ${verification.chineseChars} chars (target ${minChars}-${maxChars})`,
    });
    throw new Error(`Revision length gate failed: ${verification.chineseChars} chars (target ${minChars}-${maxChars})`);
  }

  await updateModeState(manifest.projectDir, 'revision', {
    active: false,
    status: 'completed',
    jobDir,
    currentPhase: selected.at(-1)?.name,
    completedAt: new Date().toISOString(),
  });

  return { jobDir, phases };
}

export async function getRevisionStatus(jobDir: string): Promise<string> {
  const state = await readRevisionState(path.join(path.resolve(jobDir), 'runtime', 'state.json'));
  const lines = [
    '# ONX Revision Status',
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

function buildRevisionPhases(jobDir: string): RevisionPhase[] {
  return ['01-fix-plan', '02-revision-writer', '03-review-handoff'].map((basename) => ({
    name: basename,
    promptPath: path.join(jobDir, 'prompts', `${basename}.md`),
    logPath: path.join(jobDir, 'runtime', 'logs', `${basename}.log`),
    lastMessagePath: path.join(jobDir, 'runtime', 'logs', `${basename}.last.md`),
    status: 'pending' as const,
  }));
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function buildRevisionLengthRepairPrompt(input: {
  draftPath: string;
  currentChars: number;
  minChars: number;
  maxChars: number;
}): string {
  return [
    '# Revision task: length-repair',
    '',
    `Current revised draft: ${input.draftPath}`,
    `Write finished draft to: ${input.draftPath}`,
    '',
    '## Instructions',
    `- The revised draft is too short: ${input.currentChars} Chinese characters.`,
    `- Expand it to ${input.minChars}-${input.maxChars} Chinese characters.`,
    '- Preserve the quality fixes already made.',
    '- Add real scenes, sharper external pressure, or stronger emotional aftermath instead of summary padding.',
    '- Do not collapse the draft into outline form.',
    '',
  ].join('\n');
}
