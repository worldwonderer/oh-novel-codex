import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ReviewCard,
  type AggregatedReview,
  type PublishReadiness,
  type QualityDimension,
  type QualityScore,
  type RepairLane,
  type RepairRoute,
  type ReviewConfidence,
  type ReviewIssue,
  type ReviewPriority,
  type ReviewVerdict,
  type RevisionStrategy,
  type ShipDecision,
} from './types.js';
import type { SourceOwnership } from '../draft/types.js';

const PRIORITIES: ReviewPriority[] = ['P0', 'P1', 'P2'];
const REPAIR_LANES: RepairLane[] = ['structure', 'hook', 'character', 'ending', 'pacing', 'freshness'];
const QUALITY_DIMENSIONS: QualityDimension[] = ['hook', 'character', 'pacing', 'ending', 'originality', 'continuity'];
const PRIORITY_WEIGHT: Record<ReviewPriority, number> = {
  P0: 4,
  P1: 3,
  P2: 1,
};
const REVIEWER_DIMENSIONS: Record<string, QualityDimension[]> = {
  'hook-doctor': ['hook'],
  'character-doctor': ['character', 'continuity'],
  'ending-killshot-reviewer': ['ending', 'pacing'],
  'remix-depth-reviewer': ['originality'],
  'publish-gate-reviewer': ['hook', 'character', 'pacing', 'ending', 'continuity'],
};
const REVIEWER_DEFAULT_LANES: Record<string, RepairLane[]> = {
  'hook-doctor': ['hook'],
  'character-doctor': ['character'],
  'ending-killshot-reviewer': ['ending', 'pacing'],
  'remix-depth-reviewer': ['structure'],
  'publish-gate-reviewer': ['structure', 'pacing'],
};
const LANE_PATTERNS: Record<RepairLane, RegExp[]> = {
  structure: [
    /结构|骨架|章节|chapter|beat|shadow|scene-for-scene|同构|换皮|hinge|skeleton|slot|顺序|order|middle|climax|主战场/i,
    /source-shaped|source shadow|same[- ]?hotel|same[- ]?slot|recognizable source|重复回访|雨棚对峙|求和段/i,
  ],
  hook: [
    /开头|第一页|首章|hook|opening|paragraph 1|paragraph 3|第一页最值钱|双钩|背刺信号/i,
  ],
  character: [
    /角色|人物|配角|侧角|supporting character|tool[- ]?character|活人|人味|盟友|rival|贺岚|孟书蓉|唐婳|老罗|林米/i,
  ],
  ending: [
    /结尾|末句|终章|最后一页|kill shot|ending|尾页|收尾|终场|熔炉|雨棚|最后一击|后劲/i,
  ],
  pacing: [
    /节奏|压缩|拖慢|拖沓|办手续|手续|流程|程序|核验|播报|说明性|解释性|解释权|说明|行政|纯播报|动作链|重新讲了一遍|余压|加速度|同向堆叠|重复同功能/i,
    /serial evidence[- ]?handoff|handoff cadence|same[- ]?rhythm|summary diagnosis|explanatory summary|procedure cleanup|over[- ]?explains?|too many scenes repeating the same explanation/i,
  ],
  freshness: [
    /原创|相似|freshness risk|source-shadow|source shaped|旧故事轮廓|shadow-close|stale|retell|太像|过近|熟脸|回声|同构|换皮|轮廓/i,
  ],
};
const CONTINUITY_PATTERNS = [
  /continuity|timeline|voice drift|ooc|out[- ]of[- ]character|设定|前后不一致|时间线|口吻|人设|world rule|规则冲突|关系状态/i,
];

export function parseReviewCard(markdown: string, sourcePath?: string): ReviewCard {
  const { metadata, body } = parseFrontmatter(markdown);

  const reviewer = required(metadata.reviewer, 'reviewer');
  const verdict = parseVerdict(required(metadata.verdict, 'verdict'));
  const priority = parsePriority(required(metadata.priority, 'priority'));
  const confidence = parseConfidence(required(metadata.confidence, 'confidence'));
  const ship = parseShipDecision(required(metadata.ship, 'ship'));

  const sections = splitSections(body);
  const strongestEvidence = sections['strongest evidence'] ?? [];
  const sectionsToPatch = sections['sections to patch'] ?? [];
  const shipRecommendation = sections['ship recommendation'] ?? [];
  const issues = (sections['top issues'] ?? []).map(parseIssue);

  return {
    reviewer,
    verdict,
    priority,
    confidence,
    ship,
    strongestEvidence,
    issues,
    sectionsToPatch,
    shipRecommendation,
    sourcePath,
  };
}

export async function loadReviewCards(inputPath: string): Promise<ReviewCard[]> {
  const stat = await fs.stat(inputPath);
  if (stat.isDirectory()) {
    const files = await collectMarkdownFiles(inputPath);
    const cards = await Promise.all(files.map(async (file) => parseReviewCard(await fs.readFile(file, 'utf8'), file)));
    return cards;
  }

  return [parseReviewCard(await fs.readFile(inputPath, 'utf8'), inputPath)];
}

export function aggregateReviewCards(
  cards: ReviewCard[],
  options: {
    sourceOwnership?: SourceOwnership;
    publishThresholds?: Partial<Record<QualityDimension, number>>;
  } = {},
): AggregatedReview {
  if (cards.length === 0) {
    throw new Error('No review cards provided');
  }

  const sourceOwnership = options.sourceOwnership ?? 'third-party';
  const qualityCards = cards.filter((card) => card.reviewer !== 'remix-depth-reviewer');
  const originalityCards = cards.filter((card) => card.reviewer === 'remix-depth-reviewer');

  const qualityVerdict = qualityCards.some((card) => card.verdict === 'fail')
    ? 'fail'
    : qualityCards.some((card) => card.verdict === 'mixed')
      ? 'mixed'
      : 'pass';

  const issuesByPriority: Record<ReviewPriority, string[]> = {
    P0: [],
    P1: [],
    P2: [],
  };
  const qualityIssuesByPriority: Record<ReviewPriority, string[]> = {
    P0: [],
    P1: [],
    P2: [],
  };

  const issueSets: Record<ReviewPriority, Set<string>> = {
    P0: new Set<string>(),
    P1: new Set<string>(),
    P2: new Set<string>(),
  };
  const qualityIssueSets: Record<ReviewPriority, Set<string>> = {
    P0: new Set<string>(),
    P1: new Set<string>(),
    P2: new Set<string>(),
  };

  for (const card of cards) {
    for (const issue of card.issues) {
      if (!issueSets[issue.priority].has(issue.text)) {
        issueSets[issue.priority].add(issue.text);
        issuesByPriority[issue.priority].push(issue.text);
      }
      if (card.reviewer !== 'remix-depth-reviewer' && !qualityIssueSets[issue.priority].has(issue.text)) {
        qualityIssueSets[issue.priority].add(issue.text);
        qualityIssuesByPriority[issue.priority].push(issue.text);
      }
    }
  }

  const sectionSet = new Set<string>();
  const sectionsToPatch: string[] = [];
  const qualitySectionSet = new Set<string>();
  const qualitySectionsToPatch: string[] = [];
  for (const card of cards) {
    for (const section of card.sectionsToPatch) {
      if (!sectionSet.has(section)) {
        sectionSet.add(section);
        sectionsToPatch.push(section);
      }
      if (card.reviewer !== 'remix-depth-reviewer' && !qualitySectionSet.has(section)) {
        qualitySectionSet.add(section);
        qualitySectionsToPatch.push(section);
      }
    }
  }

  const overallShip = determineOverallShip(
    sourceOwnership === 'self-owned' ? qualityCards : cards,
    sourceOwnership === 'self-owned' ? qualityIssuesByPriority : issuesByPriority,
  );
  const overallVerdict = sourceOwnership === 'self-owned' ? qualityVerdict : (
    cards.some((card) => card.verdict === 'fail')
      ? 'fail'
      : cards.some((card) => card.verdict === 'mixed')
        ? 'mixed'
        : 'pass'
  );
  const qualityShip = determineOverallShip(qualityCards, qualityIssuesByPriority);
  const originalityRisk = determineOriginalityRisk(originalityCards);
  const { repairRoutes, recommendedRevisionStrategy } = buildRepairRouting(cards, sourceOwnership);
  const qualityScorecard = buildQualityScorecard(cards, repairRoutes, originalityRisk, sourceOwnership);
  const publishReadiness = assessPublishReadiness({
    sourceOwnership,
    overallShip,
    qualityShip,
    qualityScorecard,
    thresholds: options.publishThresholds,
  });
  const compositeScore = Math.round(
    QUALITY_DIMENSIONS.reduce((sum, dimension) => sum + qualityScorecard[dimension].score, 0) / QUALITY_DIMENSIONS.length,
  );

  return {
    sourceOwnership,
    overallVerdict,
    overallShip,
    qualityVerdict,
    qualityShip,
    originalityRisk,
    recommendedRevisionStrategy,
    repairRoutes,
    reviewers: cards,
    issuesByPriority,
    qualityIssuesByPriority,
    sectionsToPatch,
    qualitySectionsToPatch,
    qualityScorecard,
    publishReadiness,
    compositeScore,
  };
}

export function renderAggregatedReviewMarkdown(aggregate: AggregatedReview): string {
  const lines: string[] = [];
  const originalityLabel = aggregate.sourceOwnership === 'self-owned' ? 'Adaptation freshness risk' : 'Originality risk';
  lines.push('# ONX Review Aggregate');
  lines.push('');
  lines.push(`- Overall verdict: **${aggregate.overallVerdict}**`);
  lines.push(`- Ship decision: **${aggregate.overallShip}**`);
  lines.push(`- Publish quality verdict: **${aggregate.qualityVerdict}**`);
  lines.push(`- Publish quality ship: **${aggregate.qualityShip}**`);
  lines.push(`- ${originalityLabel}: **${aggregate.originalityRisk}**`);
  lines.push(`- Composite score: **${aggregate.compositeScore}**`);
  lines.push(`- Review cards: **${aggregate.reviewers.length}**`);
  lines.push('');
  lines.push('## Quality scorecard');
  lines.push('');
  lines.push('| Dimension | Score | Band | Reasons |');
  lines.push('| --- | --- | --- | --- |');
  for (const dimension of QUALITY_DIMENSIONS) {
    const score = aggregate.qualityScorecard[dimension];
    lines.push(`| ${dimension} | ${score.score} | ${score.band} | ${score.reasons.join(' | ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Publish readiness');
  lines.push('');
  lines.push(`- Ready: **${aggregate.publishReadiness.ready ? 'yes' : 'no'}**`);
  lines.push(`- Failing dimensions: ${aggregate.publishReadiness.failingDimensions.length ? aggregate.publishReadiness.failingDimensions.join(', ') : 'none'}`);
  lines.push(`- Thresholds: ${QUALITY_DIMENSIONS.map((dimension) => `${dimension}>=${aggregate.publishReadiness.thresholds[dimension]}`).join(', ')}`);
  lines.push('');
  lines.push('## Reviewer summary');
  lines.push('');
  lines.push('| Reviewer | Verdict | Priority | Confidence | Ship |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const card of aggregate.reviewers) {
    lines.push(`| ${card.reviewer} | ${card.verdict} | ${card.priority} | ${card.confidence} | ${card.ship} |`);
  }

  for (const priority of PRIORITIES) {
    lines.push('');
    lines.push(`## ${priority} issues`);
    lines.push('');
    const issues = aggregate.issuesByPriority[priority];
    if (issues.length === 0) {
      lines.push('- none');
    } else {
      for (const issue of issues) {
        lines.push(`- ${issue}`);
      }
    }
  }

  lines.push('');
  lines.push('## Quality-only issues');
  for (const priority of PRIORITIES) {
    lines.push('');
    lines.push(`### ${priority}`);
    const issues = aggregate.qualityIssuesByPriority[priority];
    if (issues.length === 0) {
      lines.push('- none');
    } else {
      for (const issue of issues) {
        lines.push(`- ${issue}`);
      }
    }
  }

  lines.push('');
  lines.push('## Sections to patch');
  lines.push('');
  if (aggregate.sectionsToPatch.length === 0) {
    lines.push('- none');
  } else {
    for (const section of aggregate.sectionsToPatch) {
      lines.push(`- ${section}`);
    }
  }

  lines.push('');
  lines.push('## Quality-only sections to patch');
  lines.push('');
  if (aggregate.qualitySectionsToPatch.length === 0) {
    lines.push('- none');
  } else {
    for (const section of aggregate.qualitySectionsToPatch) {
      lines.push(`- ${section}`);
    }
  }

  lines.push('');
  lines.push('## Repair routing');
  lines.push('');
  lines.push(`- Recommended revision strategy: **${aggregate.recommendedRevisionStrategy}**`);
  if (aggregate.repairRoutes.length === 0) {
    lines.push('- Dominant lanes: none');
  } else {
    lines.push('- Dominant lanes:');
    for (const route of aggregate.repairRoutes.slice(0, 5)) {
      lines.push(`  - ${route.lane} (${route.score}): ${route.reasons.join(' | ')}`);
    }
  }

  lines.push('');
  lines.push('## Strongest evidence by reviewer');
  for (const card of aggregate.reviewers) {
    lines.push('');
    lines.push(`### ${card.reviewer}`);
    if (card.strongestEvidence.length === 0) {
      lines.push('- none');
    } else {
      for (const evidence of card.strongestEvidence) {
        lines.push(`- ${evidence}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export function defaultPublishReadinessThresholds(sourceOwnership: SourceOwnership): Record<QualityDimension, number> {
  return {
    hook: 70,
    character: 70,
    pacing: 65,
    ending: 75,
    originality: sourceOwnership === 'self-owned' ? 45 : 65,
    continuity: 70,
  };
}

export function assessPublishReadiness(input: {
  sourceOwnership: SourceOwnership;
  overallShip: ShipDecision;
  qualityShip: ShipDecision;
  qualityScorecard: AggregatedReview['qualityScorecard'];
  thresholds?: Partial<Record<QualityDimension, number>>;
}): PublishReadiness {
  const thresholds = {
    ...defaultPublishReadinessThresholds(input.sourceOwnership),
    ...(input.thresholds ?? {}),
  };
  const failingDimensions = QUALITY_DIMENSIONS.filter(
    (dimension) => input.qualityScorecard[dimension].score < thresholds[dimension],
  );
  const shipReady = input.sourceOwnership === 'self-owned'
    ? input.qualityShip === 'ship'
    : input.overallShip === 'ship';

  return {
    ready: shipReady && failingDimensions.length === 0,
    failingDimensions,
    thresholds,
  };
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files.sort();
}

function parseFrontmatter(markdown: string): { metadata: Record<string, string>; body: string } {
  if (!markdown.startsWith('---\n')) {
    throw new Error('Review card is missing YAML frontmatter');
  }

  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('Review card frontmatter is not closed');
  }

  const raw = markdown.slice(4, end).trim();
  const body = markdown.slice(end + 5).trim();
  const metadata: Record<string, string> = {};

  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!match) continue;
    metadata[match[1].trim().toLowerCase()] = match[2].trim();
  }

  return { metadata, body };
}

function splitSections(body: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = '';
  for (const line of body.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections[current]) sections[current] = [];
      continue;
    }
    const bullet = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bullet && current) {
      sections[current].push(bullet[1].trim());
    }
  }
  return sections;
}

function parseIssue(line: string): ReviewIssue {
  const match = line.match(/^\[(P0|P1|P2)\]\s*(.+)$/i);
  if (!match) {
    return { priority: 'P1', text: line.trim() };
  }
  return { priority: match[1].toUpperCase() as ReviewPriority, text: match[2].trim() };
}

function parseVerdict(value: string): ReviewVerdict {
  if (value === 'pass' || value === 'mixed' || value === 'fail') return value;
  throw new Error(`Unsupported verdict: ${value}`);
}

function parsePriority(value: string): ReviewPriority {
  const normalized = value.toUpperCase();
  if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2') return normalized;
  throw new Error(`Unsupported priority: ${value}`);
}

function parseConfidence(value: string): ReviewConfidence {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw new Error(`Unsupported confidence: ${value}`);
}

function parseShipDecision(value: string): ShipDecision {
  if (value === 'ship' || value === 'revise' || value === 'no-ship') return value;
  throw new Error(`Unsupported ship decision: ${value}`);
}

function required(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Missing required frontmatter key: ${key}`);
  return value;
}

function determineOverallShip(
  cards: ReviewCard[],
  issuesByPriority: Record<ReviewPriority, string[]>,
): ShipDecision {
  if (cards.some((card) => card.ship === 'no-ship') || issuesByPriority.P0.length > 0) {
    return 'no-ship';
  }
  if (cards.some((card) => card.ship === 'revise') || issuesByPriority.P1.length > 0) {
    return 'revise';
  }
  return 'ship';
}

function determineOriginalityRisk(cards: ReviewCard[]): 'low' | 'medium' | 'high' {
  if (cards.length === 0) return 'low';
  if (cards.some((card) => card.verdict === 'fail' || card.ship === 'no-ship')) return 'high';
  if (cards.some((card) => card.verdict === 'mixed' || card.ship === 'revise')) return 'medium';
  return 'low';
}

function buildRepairRouting(cards: ReviewCard[], sourceOwnership: SourceOwnership): {
  repairRoutes: RepairRoute[];
  recommendedRevisionStrategy: RevisionStrategy;
} {
  const laneState = new Map<RepairLane, { score: number; reasons: Set<string> }>(
    REPAIR_LANES.map((lane) => [lane, { score: 0, reasons: new Set<string>() }]),
  );

  const addLane = (lane: RepairLane, weight: number, reason: string) => {
    const current = laneState.get(lane);
    if (!current) return;
    current.score += weight;
    if (reason && current.reasons.size < 3) {
      current.reasons.add(reason.trim());
    }
  };

  const hasPrioritySourceShadowStructureIssue = cards.some((card) =>
    !isPlaceholderCard(card) && card.issues.some((issue) => issue.priority !== 'P2' && isSourceShadowStructureText(issue.text)),
  );
  const hasFailedFreshnessGate = sourceOwnership !== 'self-owned' && cards.some((card) =>
    card.reviewer === 'remix-depth-reviewer' && !isPlaceholderCard(card) && (card.verdict !== 'pass' || card.ship !== 'ship'),
  );

  for (const card of cards) {
    if (isPlaceholderCard(card)) {
      continue;
    }
    for (const lane of REVIEWER_DEFAULT_LANES[card.reviewer] ?? []) {
      addLane(lane, 1, `${card.reviewer} flagged this lane`);
    }

    for (const issue of card.issues) {
      for (const lane of detectRepairLanes(issue.text, card.reviewer)) {
        addLane(lane, PRIORITY_WEIGHT[issue.priority], issue.text);
      }
    }

    for (const section of card.sectionsToPatch) {
      for (const lane of detectRepairLanes(section, card.reviewer)) {
        addLane(lane, 2, section);
      }
    }

    for (const evidence of card.strongestEvidence) {
      for (const lane of detectRepairLanes(evidence, card.reviewer)) {
        addLane(lane, 1, evidence);
      }
    }
  }

  const repairRoutes = [...laneState.entries()]
    .map(([lane, state]) => ({
      lane,
      score: state.score,
      reasons: [...state.reasons],
    }))
    .filter((route) => route.score > 0)
    .sort((left, right) => right.score - left.score);

  const structureScore = repairRoutes.find((route) => route.lane === 'structure')?.score ?? 0;
  const pacingScore = repairRoutes.find((route) => route.lane === 'pacing')?.score ?? 0;
  const endingScore = repairRoutes.find((route) => route.lane === 'ending')?.score ?? 0;
  const freshnessScore = repairRoutes.find((route) => route.lane === 'freshness')?.score ?? 0;
  const selfOwnedFreshEnough = sourceOwnership === 'self-owned' && freshnessScore <= 3;
  const recommendedRevisionStrategy =
    hasPrioritySourceShadowStructureIssue ||
    hasFailedFreshnessGate ||
    (sourceOwnership !== 'self-owned' && !selfOwnedFreshEnough && structureScore >= 6 && freshnessScore >= 4) ||
    (structureScore >= 8 && structureScore > pacingScore + endingScore)
      ? 'structural-rebuild'
      : 'quality-patch';

  return {
    repairRoutes,
    recommendedRevisionStrategy,
  };
}

function buildQualityScorecard(
  cards: ReviewCard[],
  repairRoutes: RepairRoute[],
  originalityRisk: AggregatedReview['originalityRisk'],
  sourceOwnership: SourceOwnership,
): AggregatedReview['qualityScorecard'] {
  return {
    hook: buildLaneScore(cards, repairRoutes, 'hook', 'hook'),
    character: buildLaneScore(cards, repairRoutes, 'character', 'character'),
    pacing: buildLaneScore(cards, repairRoutes, 'pacing', 'pacing'),
    ending: buildLaneScore(cards, repairRoutes, 'ending', 'ending'),
    originality: buildOriginalityScore(cards, originalityRisk, sourceOwnership),
    continuity: buildContinuityScore(cards),
  };
}

function buildLaneScore(
  cards: ReviewCard[],
  repairRoutes: RepairRoute[],
  dimension: QualityDimension,
  lane: RepairLane,
): QualityScore {
  const route = repairRoutes.find((item) => item.lane === lane);
  const relevantCards = cards.filter((card) =>
    !isPlaceholderCard(card) && (REVIEWER_DIMENSIONS[card.reviewer] ?? []).includes(dimension),
  );
  let penalty = (route?.score ?? 0) * 6;
  for (const card of relevantCards) {
    if (card.verdict === 'fail') penalty += 12;
    else if (card.verdict === 'mixed') penalty += 6;
  }
  return toQualityScore(100 - penalty, route?.reasons ?? relevantCards.map((card) => `${card.reviewer}:${card.verdict}`).slice(0, 3));
}

function buildOriginalityScore(
  cards: ReviewCard[],
  originalityRisk: AggregatedReview['originalityRisk'],
  sourceOwnership: SourceOwnership,
): QualityScore {
  const remixCards = cards.filter((card) => card.reviewer === 'remix-depth-reviewer');
  const authoredRemixCards = remixCards.filter((card) => !isPlaceholderCard(card));
  const base = originalityRisk === 'high' ? 35 : originalityRisk === 'medium' ? 60 : 88;
  const selfOwnedBoost = sourceOwnership === 'self-owned' ? 10 : 0;
  return toQualityScore(base + selfOwnedBoost, authoredRemixCards.flatMap((card) => card.strongestEvidence).slice(0, 3));
}

function buildContinuityScore(cards: ReviewCard[]): QualityScore {
  const matchedSignals = cards.flatMap((card) => [
    ...card.issues.map((issue) => ({ text: issue.text, priority: issue.priority })),
    ...card.sectionsToPatch.map((section) => ({ text: section, priority: 'P1' as ReviewPriority })),
    ...card.strongestEvidence.map((evidence) => ({ text: evidence, priority: 'P1' as ReviewPriority })),
  ])
    .filter((signal) => !isPlaceholderReviewText(signal.text))
    .filter((signal) => CONTINUITY_PATTERNS.some((pattern) => pattern.test(signal.text)));

  const penalty = matchedSignals.reduce((sum, signal) => sum + PRIORITY_WEIGHT[signal.priority] * 5, 0);
  return toQualityScore(90 - penalty, matchedSignals.map((signal) => signal.text).slice(0, 3));
}

function toQualityScore(rawScore: number, reasons: string[]): QualityScore {
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  return {
    score,
    band: score >= 80 ? 'strong' : score >= 60 ? 'watch' : 'weak',
    reasons: reasons.filter(Boolean).slice(0, 3),
  };
}

function isPlaceholderCard(card: ReviewCard): boolean {
  const texts = [
    ...card.strongestEvidence,
    ...card.issues.map((issue) => issue.text),
    ...card.sectionsToPatch,
  ];
  return texts.length > 0 && texts.every((text) => isPlaceholderReviewText(text));
}

function isPlaceholderReviewText(text: string): boolean {
  return /dry-run placeholder card|review not executed live; confirm manually before shipping|^none$/i.test(text.trim());
}

function detectRepairLanes(text: string, reviewer: string): Set<RepairLane> {
  const lanes = new Set<RepairLane>(REVIEWER_DEFAULT_LANES[reviewer] ?? []);
  for (const lane of REPAIR_LANES) {
    if (lane === 'freshness' && !isFreshnessConcernText(text)) {
      continue;
    }
    if (LANE_PATTERNS[lane].some((pattern) => pattern.test(text))) {
      lanes.add(lane);
    }
  }
  return lanes;
}

function isSourceShadowStructureText(text: string): boolean {
  return /source[- ]?sh(?:adow|aped)|source too close|too close to the source|骨架|skeleton|same[- ]?slot|same[- ]?hotel|旧故事轮廓|scene-for-scene|换皮|shadow-close|同构|retell|set piece|beat ladder/i.test(text);
}

function isFreshnessConcernText(text: string): boolean {
  return /freshness risk|source-shadow|source shaped|旧故事轮廓|shadow-close|stale|retell|太像|过近|熟脸|回声|同构|换皮|轮廓|相似|原创/i.test(text);
}
