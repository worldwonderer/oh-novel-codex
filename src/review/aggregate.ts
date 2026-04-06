import fs from 'node:fs/promises';
import path from 'node:path';
import { ReviewCard, type AggregatedReview, type ReviewConfidence, type ReviewIssue, type ReviewPriority, type ReviewVerdict, type ShipDecision } from './types.js';

const PRIORITIES: ReviewPriority[] = ['P0', 'P1', 'P2'];

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

export function aggregateReviewCards(cards: ReviewCard[]): AggregatedReview {
  if (cards.length === 0) {
    throw new Error('No review cards provided');
  }

  const qualityCards = cards.filter((card) => card.reviewer !== 'remix-depth-reviewer');
  const originalityCards = cards.filter((card) => card.reviewer === 'remix-depth-reviewer');

  const overallVerdict = cards.some((card) => card.verdict === 'fail')
    ? 'fail'
    : cards.some((card) => card.verdict === 'mixed')
      ? 'mixed'
      : 'pass';

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

  const overallShip = determineOverallShip(cards, issuesByPriority);
  const qualityShip = determineOverallShip(qualityCards, qualityIssuesByPriority);
  const originalityRisk = determineOriginalityRisk(originalityCards);

  return {
    overallVerdict,
    overallShip,
    qualityVerdict,
    qualityShip,
    originalityRisk,
    reviewers: cards,
    issuesByPriority,
    qualityIssuesByPriority,
    sectionsToPatch,
    qualitySectionsToPatch,
  };
}

export function renderAggregatedReviewMarkdown(aggregate: AggregatedReview): string {
  const lines: string[] = [];
  lines.push('# ONX Review Aggregate');
  lines.push('');
  lines.push(`- Overall verdict: **${aggregate.overallVerdict}**`);
  lines.push(`- Ship decision: **${aggregate.overallShip}**`);
  lines.push(`- Publish quality verdict: **${aggregate.qualityVerdict}**`);
  lines.push(`- Publish quality ship: **${aggregate.qualityShip}**`);
  lines.push(`- Originality risk: **${aggregate.originalityRisk}**`);
  lines.push(`- Review cards: **${aggregate.reviewers.length}**`);
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
