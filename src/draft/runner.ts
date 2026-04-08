import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, getRepoRoot } from '../utils/paths.js';
import { assertPathExists, jobTimestamp, slugifyJobName } from '../utils/job-helpers.js';
import { updateModeState } from '../state/mode-state.js';
import { dispatchEvent } from '../events/dispatch.js';
import type { DraftJob, DraftJobOptions, DraftMode, SourceOwnership } from './types.js';
import { buildStoryMemorySnapshot } from '../story-memory/store.js';

export async function createDraftJob(options: DraftJobOptions): Promise<DraftJob> {
  const repoRoot = getRepoRoot();
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const mode: DraftMode = options.mode ?? (options.sourcePath ? 'zhihu-remix' : 'draft-longform');
  const briefText = await resolveBrief(options);
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : undefined;
  const sourceOwnership: SourceOwnership = options.sourceOwnership ?? 'third-party';

  if (mode === 'zhihu-remix' && !sourcePath) {
    throw new Error('zhihu-remix mode requires --source <path>');
  }
  if (sourcePath) {
    await assertPathExists(sourcePath, 'source');
  }

  const jobsRoot = path.join(projectDir, '.onx', 'drafts', 'jobs');
  const slug = `${jobTimestamp()}-${slugifyJobName(options.jobName ?? options.genre ?? mode, 'draft-job')}`;
  const jobDir = path.join(jobsRoot, slug);
  const promptsDir = path.join(jobDir, 'prompts');
  const outputsDir = path.join(jobDir, 'outputs');
  const handoffDir = path.join(jobDir, 'handoff');
  const storyMemorySnapshotPath = path.join(jobDir, 'story-memory.md');

  await ensureDir(promptsDir);
  await ensureDir(outputsDir);
  await ensureDir(handoffDir);
  await fs.writeFile(storyMemorySnapshotPath, await buildStoryMemorySnapshot(projectDir), 'utf8');

  const manifest = {
    createdAt: new Date().toISOString(),
    mode,
    projectDir,
    sourcePath,
    sourceOwnership,
    targetLength: options.targetLength ?? '8000-12000 Chinese characters',
    pov: options.pov ?? 'first-person',
    genre: options.genre ?? 'unspecified',
    promptsDir,
    outputsDir,
    handoffDir,
    storyMemorySnapshotPath,
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
      sourceOwnership,
      targetLength: manifest.targetLength,
      pov: manifest.pov,
      genre: manifest.genre,
      storyMemorySnapshotPath,
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
      sourceOwnership,
      mode,
      storyMemorySnapshotPath,
    }),
    'utf8',
  );

  const promptFiles = buildDraftPrompts({
    mode,
    briefPath,
    sourcePath,
    sourceOwnership,
    targetLength: manifest.targetLength,
    outputs,
    reviewHandoffPath,
    storyMemorySnapshotPath,
  });

  for (const [filename, contents] of Object.entries(promptFiles)) {
    await fs.writeFile(path.join(promptsDir, filename), contents, 'utf8');
  }

  const templateBrief = path.join(repoRoot, 'templates', 'draft-brief.md');
  await fs.copyFile(templateBrief, path.join(jobDir, 'draft-brief-template.md'));

  await fs.writeFile(
    path.join(jobDir, 'README.md'),
    buildJobReadme({ mode, briefPath, sourcePath, sourceOwnership, promptsDir, outputsDir, handoffDir, storyMemorySnapshotPath }),
    'utf8',
  );

  await updateModeState(projectDir, 'draft', {
    active: true,
    status: 'planned',
    jobDir,
    currentPhase: 'draft:01-novel-architect',
    startedAt: new Date().toISOString(),
    metadata: {
      mode,
      sourcePath,
      sourceOwnership,
      outputsDir,
      storyMemorySnapshotPath,
    },
  });

  await dispatchEvent(projectDir, {
    kind: 'draft.job.created',
    mode: 'draft',
    jobDir,
    payload: {
      sourcePath,
      sourceOwnership,
      mode,
      storyMemorySnapshotPath,
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
    await assertPathExists(resolved, 'brief file');
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
  sourceOwnership: SourceOwnership;
  targetLength: string;
  pov: string;
  genre: string;
  storyMemorySnapshotPath: string;
}): string {
  return [
    '# Draft brief',
    '',
    `- Mode: ${input.mode}`,
    `- Target length: ${input.targetLength}`,
    `- POV: ${input.pov}`,
    `- Genre lane: ${input.genre}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    `- Source ownership: ${input.sourceOwnership}`,
    `- Story memory snapshot: ${input.storyMemorySnapshotPath}`,
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
  sourceOwnership: SourceOwnership;
  targetLength: string;
  outputs: { architecture: string; outline: string; draft: string };
  reviewHandoffPath: string;
  storyMemorySnapshotPath: string;
}): Record<string, string> {
  const sourceLine = input.sourcePath ? `Source: ${input.sourcePath}` : 'Source: none';
  const modeLine =
    input.mode === 'zhihu-remix'
      ? '- This is a source-based structural remix job. Preserve the emotional engine while changing the narrative machine.'
      : '- This is an original long-form drafting job. Build from the brief, not from a source text.';
  const ownershipLine =
    input.mode === 'zhihu-remix' && input.sourceOwnership === 'self-owned'
      ? '- This source is author-owned / self-adapted. Optimize dramatic force, structure, and publishability; do not chase artificial distance for its own sake.'
      : undefined;
  const remixGuardrails =
    input.mode === 'zhihu-remix'
      ? [
          '- Define at least three deliberate structural mutations before drafting scenes.',
          '- Do not keep the same conflict carrier, pressure venue, public humiliation beat, reveal path, and ending landing all together.',
          '- If the source uses a highly recognizable set piece chain, break at least two of those set pieces instead of only renaming nouns.',
          '- Identify the two most recognizable source-shadow hinges first, then replace them before scene drafting.',
          '- Do not keep the same full-arc machine of public discovery -> scolding call -> public downgrade -> public detonation -> repeated return visits.',
          '- Do not preserve the same opener path of public-display discovery -> same-night confrontation -> next-day visual confirmation in that order.',
          '- Do not use "the rival is wearing the heroine’s ceremonial object for an important visit" as the main betrayal trigger again.',
          '- The same symbolic object may not serve as opener trigger, public humiliation prop, and ending closure device all at once.',
          '- In source-based rewrites, a symbolic object should keep at most one major story job: betrayal trigger, humiliation prop, or ending ritual.',
          '- If the source opens with the rival publicly displaying the heroine’s symbolic object, change at least two of: discovery channel, witness context, confrontation timing.',
          '- If the source already uses a public-exposure climax, do not resolve the rewrite with an on-mic / on-stage / big-screen style public detonation again.',
          '- Do not use a formal ceremony / signing / registration table as a near-substitute public reveal if it serves the same "I bring evidence and stop the union live" function.',
          '- Do not preserve the same ending path of ex-partner pleading -> public disgrace recap -> months-later stage declaration.',
          '- Do not pair a doorstep pleading scene with the same thesis line about loving the useful/forgiving version of the heroine and then close on destroying the shared ceremonial object.',
          '- Once the opening betrayal fact and deadline are live, delay symbolic-object backstory until after the protagonist takes an action turn.',
          '- When the ending lands on an irreversible object/image, do not append news-cycle noise or a second thesis paragraph that steals its oxygen.',
          '- The rival must want something concrete beyond being chosen; state what she wants, what she knows, and how she protects herself when risk arrives.',
          '- Do not let the rival use the same soft/weak posture in every scene; change her tactic across first appearance, pressure scene, and fallout scene.',
          '- At least one ally must refuse, delay, or attach a condition before helping, so support has a real cost.',
          '- If a family/company authority figure appears, give them concrete leverage over the heroine instead of generic pressure lines.',
          '- Make at least one non-hero character take an action that changes the plot, not just validate the heroine.',
          ...(input.sourceOwnership === 'self-owned'
            ? [
                '- Judge freshness by value added, not by forced distance alone.',
                '- Preserve strong source DNA when it still works; rebuild only the stale, redundant, or underpowered story functions.',
              ]
            : []),
          '- By the first 2-3 paragraphs, establish both the external system risk and the heroine’s private loss.',
          '- Do not let two adjacent middle-act scenes do the same dramatic job; each major scene should change a different asset, deadline, relationship, or piece of leverage.',
          '- Give major supporting characters distinct speech textures, decision criteria, and fears; avoid making them all sound like clean argument-delivery devices.',
          '- On the final page, choose one dominant kill-shot image or sound and one dominant quote-line; cut the rest of the ending signals around it.',
        ]
      : [];

  return {
    '01-novel-architect.md': [
      '# Draft task: novel-architect',
      '',
      `Brief: ${input.briefPath}`,
      sourceLine,
      `Story memory snapshot: ${input.storyMemorySnapshotPath}`,
      `Write architecture to: ${input.outputs.architecture}`,
      '',
      '## Instructions',
      '- Read the brief first.',
      '- Read the story memory snapshot and preserve established character motives, world rules, voice, and continuity constraints when present.',
      modeLine,
      ...(ownershipLine ? [ownershipLine] : []),
      ...remixGuardrails,
      '- Define genre lane, POV, hook, conflict ladder, midpoint pressure, ending landing, and chapter budget.',
      '- Keep the output concise and operational.',
      '',
    ].join('\n'),
    '02-outline-planner.md': [
      '# Draft task: outline-planner',
      '',
      `Brief: ${input.briefPath}`,
      `Architecture: ${input.outputs.architecture}`,
      `Story memory snapshot: ${input.storyMemorySnapshotPath}`,
      `Write outline to: ${input.outputs.outline}`,
      '',
      '## Instructions',
      '- Read the brief and architecture first.',
      '- Use the story memory snapshot to avoid breaking established relationships, timeline order, or voice profile.',
      ...(ownershipLine ? [ownershipLine] : []),
      ...remixGuardrails,
      '- Add a short "source-shadow inventory" section that names the top recognizability risks and how the outline breaks them.',
      '- Add a short "character agency map" section for the rival, one ally, and one authority figure.',
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
      `Story memory snapshot: ${input.storyMemorySnapshotPath}`,
      `Write finished draft to: ${input.outputs.draft}`,
      '',
      '## Instructions',
      '- Read the brief, architecture, and outline before drafting.',
      '- Preserve any established character/world/timeline/voice constraints from the story memory snapshot.',
      modeLine,
      ...(ownershipLine ? [ownershipLine] : []),
      `- Write a finished long-form draft, not a sample. Target length: ${input.targetLength}.`,
      ...remixGuardrails,
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

function buildReviewHandoff(input: {
  draftPath: string;
  sourcePath?: string;
  sourceOwnership: SourceOwnership;
  mode: DraftMode;
  storyMemorySnapshotPath: string;
}): string {
  return [
    '# Review handoff',
    '',
    `- Draft: ${input.draftPath}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    `- Source ownership: ${input.sourceOwnership}`,
    `- Mode: ${input.mode}`,
    `- Story memory snapshot: ${input.storyMemorySnapshotPath}`,
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
  sourceOwnership: SourceOwnership;
  promptsDir: string;
  outputsDir: string;
  handoffDir: string;
  storyMemorySnapshotPath: string;
}): string {
  return [
    '# ONX draft job',
    '',
    `- Mode: ${input.mode}`,
    `- Brief: ${input.briefPath}`,
    input.sourcePath ? `- Source: ${input.sourcePath}` : '- Source: none',
    `- Source ownership: ${input.sourceOwnership}`,
    `- Story memory snapshot: ${input.storyMemorySnapshotPath}`,
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
