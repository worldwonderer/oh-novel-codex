import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, getRepoRoot } from '../utils/paths.js';
import { updateModeState } from '../state/mode-state.js';
import { dispatchEvent } from '../events/dispatch.js';
import type { DraftJob, DraftJobOptions, DraftMode } from './types.js';

export async function createDraftJob(options: DraftJobOptions): Promise<DraftJob> {
  const repoRoot = getRepoRoot();
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const mode: DraftMode = options.mode ?? (options.sourcePath ? 'zhihu-remix' : 'draft-longform');
  const briefText = await resolveBrief(options);
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : undefined;

  if (mode === 'zhihu-remix' && !sourcePath) {
    throw new Error('zhihu-remix mode requires --source <path>');
  }
  if (sourcePath) {
    await assertExists(sourcePath, 'source');
  }

  const jobsRoot = path.join(projectDir, '.onx', 'drafts', 'jobs');
  const slug = `${timestamp()}-${slugify(options.jobName ?? options.genre ?? mode)}`;
  const jobDir = path.join(jobsRoot, slug);
  const promptsDir = path.join(jobDir, 'prompts');
  const outputsDir = path.join(jobDir, 'outputs');
  const handoffDir = path.join(jobDir, 'handoff');

  await ensureDir(promptsDir);
  await ensureDir(outputsDir);
  await ensureDir(handoffDir);

  const manifest = {
    createdAt: new Date().toISOString(),
    mode,
    projectDir,
    sourcePath,
    targetLength: options.targetLength ?? '8000-12000 Chinese characters',
    pov: options.pov ?? 'first-person',
    genre: options.genre ?? 'unspecified',
    promptsDir,
    outputsDir,
    handoffDir,
  };

  const manifestPath = path.join(jobDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const briefPath = path.join(jobDir, 'brief.md');
  await fs.writeFile(
    briefPath,
    buildBriefDocument({
      mode,
      briefText,
      sourcePath,
      targetLength: manifest.targetLength,
      pov: manifest.pov,
      genre: manifest.genre,
    }),
    'utf8',
  );

  const outputs = {
    architecture: path.join(outputsDir, 'architecture.md'),
    outline: path.join(outputsDir, 'outline.md'),
    draft: path.join(outputsDir, 'draft.md'),
  };
  await fs.writeFile(outputs.architecture, '# Architecture output\n', 'utf8');
  await fs.writeFile(outputs.outline, '# Outline output\n', 'utf8');
  await fs.writeFile(outputs.draft, '# Draft output\n', 'utf8');

  const reviewHandoffPath = path.join(handoffDir, 'review-brief.md');
  await fs.writeFile(
    reviewHandoffPath,
    buildReviewHandoff({
      draftPath: outputs.draft,
      sourcePath,
      mode,
    }),
    'utf8',
  );

  const promptFiles = buildDraftPrompts({
    mode,
    briefPath,
    sourcePath,
    targetLength: manifest.targetLength,
    outputs,
    reviewHandoffPath,
  });

  for (const [filename, contents] of Object.entries(promptFiles)) {
    await fs.writeFile(path.join(promptsDir, filename), contents, 'utf8');
  }

  const templateBrief = path.join(repoRoot, 'templates', 'draft-brief.md');
  await fs.copyFile(templateBrief, path.join(jobDir, 'draft-brief-template.md'));

  await fs.writeFile(path.join(jobDir, 'README.md'), buildJobReadme({ mode, briefPath, sourcePath, promptsDir, outputsDir, handoffDir }), 'utf8');

  await updateModeState(projectDir, 'draft', {
    active: true,
    status: 'planned',
    jobDir,
    currentPhase: 'draft:01-novel-architect',
    startedAt: new Date().toISOString(),
    metadata: {
      mode,
      sourcePath,
      outputsDir,
    },
  });

  await dispatchEvent(projectDir, {
    kind: 'draft.job.created',
    mode: 'draft',
    jobDir,
    payload: {
      sourcePath,
      mode,
    },
  });

  return {
    jobDir,
    promptsDir,
    outputsDir,
    handoffDir,
    manifestPath,
    projectDir,
  };
}

async function resolveBrief(options: DraftJobOptions): Promise<string> {
  if (options.brief) return options.brief.trim();
  if (options.briefPath) {
    const resolved = path.resolve(options.briefPath);
    await assertExists(resolved, 'brief file');
    return (await fs.readFile(resolved, 'utf8')).trim();
  }
  if (options.sourcePath) {
    return `Source-based rewrite from ${path.resolve(options.sourcePath)}`;
  }
  throw new Error('run-draft requires --brief, --brief-file, or --source');
}

function buildBriefDocument(input: {
  mode: DraftMode;
  briefText: string;
  sourcePath?: string;
  targetLength: string;
  pov: string;
  genre: string;
}): string {
  return [
    '# Draft brief',
    '',
    `- Mode: ${input.mode}`,
    `- Target length: ${input.targetLength}`,
    `- POV: ${input.pov}`,
    `- Genre lane: ${input.genre}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    '',
    '## Brief',
    '',
    input.briefText,
    '',
  ].join('\n');
}

function buildDraftPrompts(input: {
  mode: DraftMode;
  briefPath: string;
  sourcePath?: string;
  targetLength: string;
  outputs: { architecture: string; outline: string; draft: string };
  reviewHandoffPath: string;
}): Record<string, string> {
  const sourceLine = input.sourcePath ? `Source: ${input.sourcePath}` : 'Source: none';
  const modeLine =
    input.mode === 'zhihu-remix'
      ? '- This is a source-based structural remix job. Preserve the emotional engine while changing the narrative machine.'
      : '- This is an original long-form drafting job. Build from the brief, not from a source text.';

  return {
    '01-novel-architect.md': [
      '# Draft task: novel-architect',
      '',
      `Brief: ${input.briefPath}`,
      sourceLine,
      `Write architecture to: ${input.outputs.architecture}`,
      '',
      '## Instructions',
      '- Read the brief first.',
      modeLine,
      '- Define genre lane, POV, hook, conflict ladder, midpoint pressure, ending landing, and chapter budget.',
      '- Keep the output concise and operational.',
      '',
    ].join('\n'),
    '02-outline-planner.md': [
      '# Draft task: outline-planner',
      '',
      `Brief: ${input.briefPath}`,
      `Architecture: ${input.outputs.architecture}`,
      `Write outline to: ${input.outputs.outline}`,
      '',
      '## Instructions',
      '- Read the brief and architecture first.',
      '- Produce a 3–5 chapter beat map.',
      '- Include mini-payoffs, chapter-end pull, and escalation order.',
      '',
    ].join('\n'),
    '03-scene-writer.md': [
      '# Draft task: scene-writer',
      '',
      `Brief: ${input.briefPath}`,
      `Architecture: ${input.outputs.architecture}`,
      `Outline: ${input.outputs.outline}`,
      sourceLine,
      `Write finished draft to: ${input.outputs.draft}`,
      '',
      '## Instructions',
      '- Read the brief, architecture, and outline before drafting.',
      modeLine,
      `- Write a finished long-form draft, not a sample. Target length: ${input.targetLength}.`,
      '- Keep paragraphs mobile-readable and scene-first.',
      '- Prefer strong dialogue and visible cause/effect.',
      '- Before finalizing, count Chinese characters and confirm the draft is inside the target range.',
      '- If the draft is under target, expand by adding real scenes, stronger middle pressure, and heavier ending payoff; do not pad with summary paragraphs.',
      '',
    ].join('\n'),
    '04-review-handoff.md': [
      '# Draft task: review handoff',
      '',
      `Draft: ${input.outputs.draft}`,
      sourceLine,
      `Write handoff note to: ${input.reviewHandoffPath}`,
      '',
      '## Instructions',
      '- Summarize what the reviewers must focus on next.',
      '- Point to the draft and source paths exactly.',
      '- Prepare the draft for `onx run-review`.',
      '',
    ].join('\n'),
  };
}

function buildReviewHandoff(input: { draftPath: string; sourcePath?: string; mode: DraftMode }): string {
  return [
    '# Review handoff',
    '',
    `- Draft: ${input.draftPath}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    `- Mode: ${input.mode}`,
    '',
    '## Review focus',
    '',
    '- hook density',
    '- ending force',
    '- side-character depth',
    '- publish readiness',
    input.mode === 'zhihu-remix' ? '- skeleton remix depth' : '- structural consistency',
    '',
    '## Next step',
    '',
    '```bash',
    input.sourcePath
      ? `onx run-review --draft "${input.draftPath}" --source "${input.sourcePath}" --project .`
      : `onx run-review --draft "${input.draftPath}" --project .`,
    '```',
    '',
  ].join('\n');
}

function buildJobReadme(input: {
  mode: DraftMode;
  briefPath: string;
  sourcePath?: string;
  promptsDir: string;
  outputsDir: string;
  handoffDir: string;
}): string {
  return [
    '# ONX draft job',
    '',
    `- Mode: ${input.mode}`,
    `- Brief: ${input.briefPath}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    `- Prompts: ${input.promptsDir}`,
    `- Outputs: ${input.outputsDir}`,
    `- Review handoff: ${input.handoffDir}`,
    '',
    '## Suggested order',
    '',
    '1. `01-novel-architect.md`',
    '2. `02-outline-planner.md`',
    '3. `03-scene-writer.md`',
    '4. `04-review-handoff.md`',
    '',
  ].join('\n');
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
  return normalized || 'draft-job';
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
