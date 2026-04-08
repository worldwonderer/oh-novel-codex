import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards } from '../review/aggregate.js';
import type { RepairRoute, RevisionStrategy, ReviewCard, ReviewIssue } from '../review/types.js';
import { ensureDir, getRepoRoot } from '../utils/paths.js';
import { jobTimestamp, slugifyJobName } from '../utils/job-helpers.js';
import { initializeRevisionState } from './state.js';
import { countChineseCharactersInFile } from '../verification/verifier.js';
import { updateModeState } from '../state/mode-state.js';
import type { RevisionFocus, RevisionJob, RevisionJobOptions } from './types.js';
import type { SourceOwnership } from '../draft/types.js';
import { buildStoryMemorySnapshot } from '../story-memory/store.js';

export async function createRevisionJob(options: RevisionJobOptions): Promise<RevisionJob> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const draftPath = path.resolve(options.draftPath);
  const reviewJobDir = path.resolve(options.reviewJobDir);
  const focus = options.focus ?? 'quality';
  const reviewManifest = JSON.parse(await fs.readFile(path.join(reviewJobDir, 'manifest.json'), 'utf8')) as {
    sourceOwnership?: SourceOwnership;
  };
  const sourceOwnership: SourceOwnership = reviewManifest.sourceOwnership ?? 'third-party';
  const cards = await loadReviewCards(path.join(reviewJobDir, 'cards'));
  const selectedCards = filterCardsByFocus(cards, focus);
  const aggregate = aggregateReviewCards(cards, { sourceOwnership });
  const strategy = aggregate.recommendedRevisionStrategy;
  const draftChineseChars = await countChineseCharactersInFile(draftPath);

  const jobsRoot = path.join(projectDir, '.onx', 'revisions', 'jobs');
  const slug = `${jobTimestamp()}-${slugifyJobName(options.jobName ?? path.basename(draftPath, path.extname(draftPath)), 'revision-job')}`;
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
    projectDir,
    draftPath,
    reviewJobDir,
    sourceOwnership,
    focus,
    strategy,
    repairRoutes: aggregate.repairRoutes,
    draftChineseChars,
    selectedReviewers: selectedCards.map((card) => card.reviewer),
    storyMemorySnapshotPath,
  };
  const manifestPath = path.join(jobDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const briefPath = path.join(jobDir, 'brief.md');
  await fs.writeFile(
    briefPath,
    buildRevisionBrief(draftPath, sourceOwnership, focus, strategy, aggregate.repairRoutes, selectedCards, aggregate, draftChineseChars, storyMemorySnapshotPath),
    'utf8',
  );

  const outputs = {
    revisionPlan: path.join(outputsDir, 'revision-plan.md'),
    revisedDraft: path.join(outputsDir, 'revised-draft.md'),
  };
  await fs.writeFile(outputs.revisionPlan, '# Revision plan output\n', 'utf8');
  await fs.writeFile(outputs.revisedDraft, '# Revised draft output\n', 'utf8');

  const reviewHandoff = path.join(handoffDir, 'review-handoff.md');
  await fs.writeFile(
    reviewHandoff,
    [
      '# Revision review handoff',
      '',
      `- Revised draft: ${outputs.revisedDraft}`,
      `- Original draft: ${draftPath}`,
      `- Review job: ${reviewJobDir}`,
      '',
      '## Next step',
      '',
      '```bash',
      `onx run-review --draft "${outputs.revisedDraft}" --project .`,
      '```',
      '',
    ].join('\n'),
    'utf8',
  );

  const prompts = buildRevisionPrompts({
    briefPath,
    outputs,
    draftPath,
    reviewHandoff,
    sourceOwnership,
    focus,
    strategy,
    repairRoutes: aggregate.repairRoutes,
    draftChineseChars,
    storyMemorySnapshotPath,
  });
  for (const [filename, content] of Object.entries(prompts)) {
    await fs.writeFile(path.join(promptsDir, filename), content, 'utf8');
  }

  const repoRoot = getRepoRoot();
  await fs.copyFile(path.join(repoRoot, 'templates', 'draft-brief.md'), path.join(jobDir, 'revision-brief-template.md'));

  await initializeRevisionState(jobDir, [
    buildRevisionPhase(jobDir, '01-fix-plan'),
    buildRevisionPhase(jobDir, '02-revision-writer'),
    buildRevisionPhase(jobDir, '03-review-handoff'),
  ]);

  await updateModeState(projectDir, 'revision', {
    active: true,
    status: 'planned',
    jobDir,
    currentPhase: '01-fix-plan',
    startedAt: new Date().toISOString(),
    metadata: {
      reviewJobDir,
      focus,
      draftPath,
    },
  });

  return {
    jobDir,
    promptsDir,
    outputsDir,
    handoffDir,
    manifestPath,
  };
}

function filterCardsByFocus(cards: ReviewCard[], focus: RevisionFocus): ReviewCard[] {
  if (focus === 'all') return cards;
  if (focus === 'originality') return cards.filter((card) => card.reviewer === 'remix-depth-reviewer');
  return cards
    .filter((card) => card.reviewer !== 'remix-depth-reviewer')
    .map((card) => ({
      ...card,
      issues: card.issues.filter((issue) => !isOriginalityIssue(issue)),
      sectionsToPatch: card.sectionsToPatch.filter((section) => !isOriginalityText(section)),
      strongestEvidence: card.strongestEvidence.filter((evidence) => !isOriginalityText(evidence)),
    }))
    .filter((card) => card.issues.length > 0 || card.sectionsToPatch.length > 0 || card.strongestEvidence.length > 0);
}

function buildRevisionBrief(
  draftPath: string,
  sourceOwnership: SourceOwnership,
  focus: RevisionFocus,
  strategy: RevisionStrategy,
  repairRoutes: RepairRoute[],
  cards: ReviewCard[],
  aggregate: ReturnType<typeof aggregateReviewCards>,
  draftChineseChars: number,
  storyMemorySnapshotPath: string,
): string {
  const lines = ['# Revision brief', '', `- Draft: ${draftPath}`, `- Focus: ${focus}`, ''];
  lines.push(`- Current draft Chinese chars: ${draftChineseChars}`);
  lines.push('- Target length: 8000-12000 Chinese characters');
  lines.push(`- Source ownership: ${sourceOwnership}`);
  lines.push(`- Recommended revision strategy: ${strategy}`);
  lines.push(`- Publish quality verdict: ${aggregate.qualityVerdict}`);
  lines.push(`- Publish quality ship: ${aggregate.qualityShip}`);
  lines.push(`- Originality risk: ${aggregate.originalityRisk}`);
  lines.push(`- Story memory snapshot: ${storyMemorySnapshotPath}`);
  lines.push('');
  lines.push('## Priority issues');
  lines.push('');
  for (const card of cards) {
    for (const issue of card.issues.filter((issue) => issue.priority === 'P0' || issue.priority === 'P1')) {
      lines.push(`- [${issue.priority}] (${card.reviewer}) ${issue.text}`);
    }
  }
  lines.push('');
  lines.push('## Sections to patch');
  lines.push('');
  const sections = focus === 'quality'
    ? aggregate.qualitySectionsToPatch.filter((section) => !isOriginalityText(section))
    : aggregate.sectionsToPatch;
  for (const section of sections) {
    lines.push(`- ${section}`);
  }
  lines.push('');
  lines.push('## Repair routing');
  lines.push('');
  if (repairRoutes.length === 0) {
    lines.push('- none');
  } else {
    for (const route of repairRoutes.slice(0, 5)) {
      lines.push(`- ${route.lane} (${route.score}): ${route.reasons.join(' | ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function buildRevisionPrompts(input: {
  briefPath: string;
  outputs: { revisionPlan: string; revisedDraft: string };
  draftPath: string;
  reviewHandoff: string;
  sourceOwnership: SourceOwnership;
  focus: RevisionFocus;
  strategy: RevisionStrategy;
  repairRoutes: RepairRoute[];
  draftChineseChars: number;
  storyMemorySnapshotPath: string;
}): Record<string, string> {
  const strategyInstructions = buildStrategyInstructions(input.strategy);
  const laneInstructions = buildLaneInstructions(input.repairRoutes, input.sourceOwnership);
  const originalityInstructions =
    input.focus === 'quality'
      ? []
      : [
          '- Treat originality as a first-class fix target, not a cosmetic pass.',
          '- Mutate at least three structural nodes if the review says the rewrite is too shadow-close.',
          '- Do not preserve the same conflict carrier, pressure venue, reveal path, and ending landing all at once.',
          '- Preserve the emotional engine, but change the machine that delivers it.',
          '- Identify the two most recognizable source-shadow hinges before planning any line-level polish.',
          '- Replace at least one major hinge family entirely: opener discovery engine, public downgrade engine, public-break engine, or repeated-return resolution.',
          '- Do not keep the same full-arc machine of public discovery -> scolding call -> public downgrade -> public detonation -> repeated return visits.',
          '- Do not preserve the same opener path of public-display discovery -> same-night confrontation -> next-day visual confirmation in that order.',
          '- Do not use "the rival is wearing the heroine’s ceremonial object for an important visit" as the main betrayal trigger again.',
          '- The same symbolic object may keep at most one of these jobs: opener trigger, humiliation prop, ending closure device.',
          '- Do not use a formal ceremony / signing / registration table as a near-substitute reveal if it still functions as "the heroine brings evidence and stops the union live."',
          '- Do not preserve the same ending path of ex-partner pleading -> public disgrace recap -> months-later stage declaration.',
          '- Do not pair a doorstep pleading scene with the same "you loved the useful/forgiving version of me" diagnosis and then close on destroying the shared ceremonial object.',
          '- If the current draft still opens on a public display of the heroine’s symbolic object, rewrite that discovery pattern instead of only polishing the prose.',
        ];
  const craftInstructions = [
    '- If the opening already has betrayal fact + countdown pressure, move explanatory backstory behind the first decisive action turn.',
    '- By paragraph 3, make sure the draft has surfaced both the external system threat and the heroine’s private/personal loss.',
    '- If multiple ally scenes all follow the same risk -> "I know" -> support rhythm, compress or vary them so at least one helper changes the direction or adds real cost.',
    '- In any 3-scene stretch, do not repeat the same refusal/negotiation/explanation function; cut or replace one scene so the board actually changes.',
    '- If one chapter promises live aftermath, do not pay it off with summary fallout alone; dramatize at least one concrete consequence scene.',
    '- Once the ending lands on an irreversible concrete image, do not append hot-search/news-cycle callbacks or a second thesis line unless they change the ending beat itself.',
    '- Give the rival a concrete objective, knowledge boundary, and self-protection move; do not leave her as a prop who only absorbs exposure.',
    '- Make the rival switch tactics across her major appearances instead of repeating the same soft or passive posture.',
    '- Make at least one ally refuse, delay, bargain, or impose a condition before helping so support has a cost.',
    '- If an authority figure applies pressure, show the exact leverage they hold over the heroine rather than generic face-saving dialogue.',
    '- Give major supporting characters distinct diction, leverage, and decision logic so they do not all sound like the same cold explanatory voice.',
    '- On the last page, keep one dominant terminal action/image and one dominant terminal line; remove extra summary signals that compete with the kill shot.',
    ...(input.sourceOwnership === 'self-owned'
      ? [
          '- This is an author-owned adaptation. Do not spend revision budget chasing artificial distance once the adaptation already feels fresh enough.',
          '- When freshness is good enough, prefer scene power, character agency, and finish quality over further divergence from the source.',
        ]
      : []),
  ];
  return {
    '01-fix-plan.md': [
      '# Revision task: revision-doctor',
      '',
      `Brief: ${input.briefPath}`,
      `Story memory snapshot: ${input.storyMemorySnapshotPath}`,
      `Write revision plan to: ${input.outputs.revisionPlan}`,
      '',
      '## Instructions',
      '- Read the story memory snapshot before planning scene changes so you preserve established continuity, character intent, and voice.',
      `- Focus mode: ${input.focus}.`,
      `- Strategy: ${input.strategy}.`,
      '- Prioritize P0 and P1 quality issues first.',
      ...strategyInstructions,
      ...laneInstructions,
      ...originalityInstructions,
      ...craftInstructions,
      '- Preserve the strongest parts of the draft.',
      '- Produce a concise repair plan by scene and issue.',
      input.strategy === 'structural-rebuild'
        ? '- Name the exact hinge replacements up front so the writer cannot drift back into the old skeleton.'
        : '- Name the exact local scene surgeries up front so the writer does not drift into blanket line-polish.',
      '',
    ].join('\n'),
    '02-revision-writer.md': [
      '# Revision task: revision-writer',
      '',
      `Brief: ${input.briefPath}`,
      `Original draft: ${input.draftPath}`,
      `Revision plan: ${input.outputs.revisionPlan}`,
      `Story memory snapshot: ${input.storyMemorySnapshotPath}`,
      `Write finished draft to: ${input.outputs.revisedDraft}`,
      '',
      '## Instructions',
      '- Preserve established continuity, timeline order, and voice constraints from the story memory snapshot.',
      `- Focus mode: ${input.focus}.`,
      `- Strategy: ${input.strategy}.`,
      input.strategy === 'structural-rebuild'
        ? '- This cycle is structure-first: reorder, merge, cut, or replace scenes before you spend time on line-level polish.'
        : input.focus === 'quality'
          ? '- Patch only what is needed for publish quality unless the brief explicitly asks for deeper rewrite.'
          : '- Rebuild aggressively where needed: you may reorder chapters, replace hinge scenes, and rewrite whole sections to break source-shadow structure.',
      ...strategyInstructions,
      ...laneInstructions,
      ...originalityInstructions,
      ...craftInstructions,
      input.strategy === 'structural-rebuild'
        ? '- Execute the hinge replacements before polishing hooks or prose-level style.'
        : '- Do the smallest scene-level surgery that clears the flagged issues, then polish prose last.',
      '- Remove confession-dump scenes, tool-character behavior, and ending over-explanation where present.',
      `- Keep the output a full finished draft, not notes. The current draft has ${input.draftChineseChars} Chinese characters; do not shrink it materially.`,
      '- Do not reduce below 8000 Chinese characters.',
      '- If you compress one section, replace the lost volume with scene-based material elsewhere.',
      '',
    ].join('\n'),
    '03-review-handoff.md': [
      '# Revision task: review handoff',
      '',
      `Revised draft: ${input.outputs.revisedDraft}`,
      `Write handoff note to: ${input.reviewHandoff}`,
      '',
      '## Instructions',
      '- Summarize which issues were fixed and which still need review attention.',
      '- Prepare the revised draft for another review pass.',
      '',
    ].join('\n'),
  };
}


function buildRevisionPhase(jobDir: string, basename: string) {
  return {
    name: basename,
    promptPath: path.join(jobDir, 'prompts', `${basename}.md`),
    logPath: path.join(jobDir, 'runtime', 'logs', `${basename}.log`),
    lastMessagePath: path.join(jobDir, 'runtime', 'logs', `${basename}.last.md`),
    status: 'pending' as const,
  };
}

function isOriginalityIssue(issue: ReviewIssue): boolean {
  return isOriginalityText(issue.text);
}

function isOriginalityText(text: string): boolean {
  return /原创|相似|remix|骨架|beat|shadow|scene-for-scene|同构|换皮|重逢绑定|龙族长姐|机芯/i.test(text);
}

function buildStrategyInstructions(strategy: RevisionStrategy): string[] {
  if (strategy === 'structural-rebuild') {
    return [
      '- Treat this as an architecture-level repair pass, not a sentence-polish pass.',
      '- Decide keep / cut / merge / replace by scene or chapter before rewriting prose.',
      '- If two scenes do the same job, compress or replace one so the board state changes each time.',
    ];
  }

  return [
    '- Treat this as a focused publish-quality patch pass; preserve the working architecture unless a flagged issue clearly requires local scene surgery.',
    '- Prefer compression, reorder, and scene-surgery over rebuilding the whole machine.',
  ];
}

function buildLaneInstructions(repairRoutes: RepairRoute[], sourceOwnership: SourceOwnership): string[] {
  const dominantLanes = repairRoutes
    .slice(0, 3)
    .map((route) => route.lane);

  const instructions: string[] = [];
  if (dominantLanes.includes('hook')) {
    instructions.push('- Re-sequence the opening so personal loss / betrayal lands before explanatory process detail.');
  }
  if (dominantLanes.includes('character')) {
    instructions.push('- Convert at least one explanation-only supporting-character beat into an action-with-cost beat.');
  }
  if (dominantLanes.includes('structure')) {
    instructions.push('- Fix board shape, not just lines: change scene order, merge duplicate functions, or replace one weak hinge family entirely.');
  }
  if (dominantLanes.includes('ending')) {
    instructions.push('- Protect the kill shot by compressing any pre-ending pleading or explanation that steals the ending’s acceleration.');
  }
  if (dominantLanes.includes('pacing')) {
    instructions.push('- Compress procedural or explanatory aftercare after the real climax; keep the scene attached to the last endangered asset, not to paperwork.');
    instructions.push('- Replace at least one serial evidence-handoff beat with resistance, misread, or cost so the board changes instead of only adding documents.');
    instructions.push('- When evidence lands, cut summary diagnosis and let reactions,裁决, or concrete consequence carry the force.');
  }
  if (dominantLanes.includes('freshness')) {
    instructions.push(
      sourceOwnership === 'self-owned'
        ? '- Refresh stale self-shadow only when it improves this version’s power in its new format; do not chase artificial distance.'
        : '- Break recognizable source-shadow hinge families instead of relying on cosmetic substitutions.',
    );
  }
  return instructions;
}
