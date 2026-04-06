import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards } from '../review/aggregate.js';
import type { ReviewCard, ReviewIssue } from '../review/types.js';
import { ensureDir, getRepoRoot } from '../utils/paths.js';
import { initializeRevisionState } from './state.js';
import { countChineseCharactersInFile } from '../verification/verifier.js';
import { updateModeState } from '../state/mode-state.js';
import type { RevisionFocus, RevisionJob, RevisionJobOptions } from './types.js';

export async function createRevisionJob(options: RevisionJobOptions): Promise<RevisionJob> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const draftPath = path.resolve(options.draftPath);
  const reviewJobDir = path.resolve(options.reviewJobDir);
  const focus = options.focus ?? 'quality';
  const cards = await loadReviewCards(path.join(reviewJobDir, 'cards'));
  const selectedCards = filterCardsByFocus(cards, focus);
  const aggregate = aggregateReviewCards(cards);
  const draftChineseChars = await countChineseCharactersInFile(draftPath);

  const jobsRoot = path.join(projectDir, '.onx', 'revisions', 'jobs');
  const slug = `${timestamp()}-${slugify(options.jobName ?? path.basename(draftPath, path.extname(draftPath)))}`;
  const jobDir = path.join(jobsRoot, slug);
  const promptsDir = path.join(jobDir, 'prompts');
  const outputsDir = path.join(jobDir, 'outputs');
  const handoffDir = path.join(jobDir, 'handoff');
  await ensureDir(promptsDir);
  await ensureDir(outputsDir);
  await ensureDir(handoffDir);

  const manifest = {
    createdAt: new Date().toISOString(),
    projectDir,
    draftPath,
    reviewJobDir,
    focus,
    draftChineseChars,
    selectedReviewers: selectedCards.map((card) => card.reviewer),
  };
  const manifestPath = path.join(jobDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const briefPath = path.join(jobDir, 'brief.md');
  await fs.writeFile(briefPath, buildRevisionBrief(draftPath, focus, selectedCards, aggregate, draftChineseChars), 'utf8');

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
    focus,
    draftChineseChars,
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
  focus: RevisionFocus,
  cards: ReviewCard[],
  aggregate: ReturnType<typeof aggregateReviewCards>,
  draftChineseChars: number,
): string {
  const lines = ['# Revision brief', '', `- Draft: ${draftPath}`, `- Focus: ${focus}`, ''];
  lines.push(`- Current draft Chinese chars: ${draftChineseChars}`);
  lines.push('- Target length: 8000-12000 Chinese characters');
  lines.push(`- Publish quality verdict: ${aggregate.qualityVerdict}`);
  lines.push(`- Publish quality ship: ${aggregate.qualityShip}`);
  lines.push(`- Originality risk: ${aggregate.originalityRisk}`);
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
  return lines.join('\n');
}

function buildRevisionPrompts(input: {
  briefPath: string;
  outputs: { revisionPlan: string; revisedDraft: string };
  draftPath: string;
  reviewHandoff: string;
  focus: RevisionFocus;
  draftChineseChars: number;
}): Record<string, string> {
  return {
    '01-fix-plan.md': [
      '# Revision task: revision-doctor',
      '',
      `Brief: ${input.briefPath}`,
      `Write revision plan to: ${input.outputs.revisionPlan}`,
      '',
      '## Instructions',
      `- Focus mode: ${input.focus}.`,
      '- Prioritize P0 and P1 quality issues first.',
      '- Preserve the strongest parts of the draft.',
      '- Produce a concise repair plan by scene and issue.',
      '',
    ].join('\n'),
    '02-revision-writer.md': [
      '# Revision task: revision-writer',
      '',
      `Brief: ${input.briefPath}`,
      `Original draft: ${input.draftPath}`,
      `Revision plan: ${input.outputs.revisionPlan}`,
      `Write finished draft to: ${input.outputs.revisedDraft}`,
      '',
      '## Instructions',
      `- Focus mode: ${input.focus}.`,
      '- Patch only what is needed for publish quality unless the brief explicitly asks for deeper rewrite.',
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

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'revision-job';
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
