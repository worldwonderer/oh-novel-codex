import fs from 'node:fs/promises';
import path from 'node:path';
import { createDraftJob } from '../draft/runner.js';
import { ensureDir } from '../utils/paths.js';
import { createReviewJob } from '../review/runner.js';
import { updateModeState } from '../state/mode-state.js';
import { initializeWorkflowState, type WorkflowPhase, type WorkflowState } from './state.js';
import type { WorkflowJob, WorkflowJobOptions } from './types.js';
import { dispatchEvent } from '../events/dispatch.js';

export async function createWorkflowJob(options: WorkflowJobOptions): Promise<WorkflowJob> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const draftJob = await createDraftJob({
    brief: options.brief,
    briefPath: options.briefPath,
    sourcePath: options.sourcePath,
    projectDir,
    jobName: options.jobName,
    mode: options.mode,
    targetLength: options.targetLength,
    pov: options.pov,
    genre: options.genre,
  });

  const draftManifest = JSON.parse(await fs.readFile(draftJob.manifestPath, 'utf8')) as {
    sourcePath?: string;
    outputsDir: string;
    mode: string;
  };
  const draftOutputPath = path.join(draftManifest.outputsDir, 'draft.md');

  const reviewJob = await createReviewJob({
    draftPath: draftOutputPath,
    sourcePath: draftManifest.sourcePath,
    projectDir,
    jobName: options.jobName ? `${options.jobName}-review` : undefined,
    reviewers: options.reviewers,
  });

  const jobsRoot = path.join(projectDir, '.onx', 'workflows', 'jobs');
  const slug = `${timestamp()}-${slugify(options.jobName ?? options.genre ?? draftManifest.mode)}`;
  const jobDir = path.join(jobsRoot, slug);
  const finalDir = path.join(jobDir, 'final');
  await ensureDir(finalDir);

  const manifest = {
    createdAt: new Date().toISOString(),
    projectDir,
    mode: draftManifest.mode,
    sourcePath: draftManifest.sourcePath,
    draftJobDir: draftJob.jobDir,
    draftOutputPath,
    reviewJobDir: reviewJob.jobDir,
    reviewCardsDir: reviewJob.cardsDir,
    reviewFinalDir: reviewJob.finalDir,
    qualityLoopMax: 2,
    iterations: [
      {
        stage: 'initial',
        draftPath: draftOutputPath,
        reviewJobDir: reviewJob.jobDir,
      },
    ],
    aggregateCommand: `onx run-review --job "${reviewJob.jobDir}" --aggregate --output "${path.join(reviewJob.finalDir, 'aggregate.md')}"`,
  };

  const manifestPath = path.join(jobDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const statePath = await initializeWorkflowState(jobDir, buildWorkflowPhases(draftJob.jobDir, reviewJob.jobDir));
  const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as WorkflowState;

  const runbookPath = path.join(jobDir, 'RUNBOOK.md');
  await fs.writeFile(runbookPath, buildRunbook(manifest), 'utf8');

  await updateModeState(projectDir, 'workflow', {
    active: true,
    status: 'planned',
    jobDir,
    currentPhase: 'draft:01-novel-architect',
    startedAt: new Date().toISOString(),
    metadata: {
      draftJobDir: draftJob.jobDir,
      reviewJobDir: reviewJob.jobDir,
      sourcePath: draftManifest.sourcePath,
      mode: draftManifest.mode,
    },
  });

  await dispatchEvent(projectDir, {
    kind: 'workflow.job.created',
    mode: 'workflow',
    jobDir,
    payload: {
      draftJobDir: draftJob.jobDir,
      reviewJobDir: reviewJob.jobDir,
      sourcePath: draftManifest.sourcePath,
      mode: draftManifest.mode,
    },
  });

  return {
    jobDir,
    manifestPath,
    runbookPath,
    statePath,
    draftJob,
    reviewJob,
    state,
  };
}

function buildRunbook(manifest: {
  mode: string;
  sourcePath?: string;
  draftJobDir: string;
  draftOutputPath: string;
  reviewJobDir: string;
  reviewCardsDir: string;
  reviewFinalDir: string;
  aggregateCommand: string;
}): string {
  return [
    '# ONX workflow job',
    '',
    `- Mode: ${manifest.mode}`,
    manifest.sourcePath ? `- Source: ${manifest.sourcePath}` : '- Source: none',
    `- Draft job: ${manifest.draftJobDir}`,
    `- Draft output: ${manifest.draftOutputPath}`,
    `- Review job: ${manifest.reviewJobDir}`,
    `- Review cards: ${manifest.reviewCardsDir}`,
    `- Review final: ${manifest.reviewFinalDir}`,
    '',
    '## Order',
    '',
    '1. Complete the draft job prompts and write the full draft.',
    '2. Use the review job prompts to generate reviewer cards.',
    '3. Aggregate the cards into one final verdict.',
    '',
    '## Aggregate command',
    '',
    '```bash',
    manifest.aggregateCommand,
    '```',
    '',
  ].join('\n');
}

function buildWorkflowPhases(draftJobDir: string, reviewJobDir: string): WorkflowPhase[] {
  return [
    buildPromptPhase('draft:01-novel-architect', 'draft', draftJobDir, '01-novel-architect'),
    buildPromptPhase('draft:02-outline-planner', 'draft', draftJobDir, '02-outline-planner'),
    buildPromptPhase('draft:03-scene-writer', 'draft', draftJobDir, '03-scene-writer'),
    buildPromptPhase('draft:04-review-handoff', 'draft', draftJobDir, '04-review-handoff'),
    buildPromptPhase('review:hook-doctor', 'review', reviewJobDir, 'hook-doctor'),
    buildPromptPhase('review:character-doctor', 'review', reviewJobDir, 'character-doctor'),
    buildPromptPhase('review:ending-killshot-reviewer', 'review', reviewJobDir, 'ending-killshot-reviewer'),
    buildPromptPhase('review:remix-depth-reviewer', 'review', reviewJobDir, 'remix-depth-reviewer'),
    buildPromptPhase('review:publish-gate-reviewer', 'review', reviewJobDir, 'publish-gate-reviewer'),
    {
      name: 'review:aggregate',
      kind: 'aggregate',
      status: 'pending',
    },
  ];
}

function buildPromptPhase(
  name: string,
  kind: 'draft' | 'review',
  jobDir: string,
  basename: string,
): WorkflowPhase {
  return {
    name,
    kind,
    promptPath: path.join(jobDir, 'prompts', `${basename}.md`),
    logPath: path.join(jobDir, 'runtime', 'logs', `${basename}.log`),
    lastMessagePath: path.join(jobDir, 'runtime', 'logs', `${basename}.last.md`),
    status: 'pending',
  };
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'workflow-job';
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
