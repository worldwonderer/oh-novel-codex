import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards } from '../review/aggregate.js';
import type { QualityDimension, ShipDecision } from '../review/types.js';
import type { SourceOwnership } from '../draft/types.js';

export type ReviewQualityVerification = {
  compositeScore: number;
  overallShip: ShipDecision;
  qualityShip: ShipDecision;
  publishReady: boolean;
  failingDimensions: QualityDimension[];
};

export async function verifyDraftJob(jobDir: string): Promise<{ ok: boolean; checks: Record<string, boolean>; chineseChars?: number }> {
  const outputsDir = path.join(path.resolve(jobDir), 'outputs');
  const draftPath = path.join(outputsDir, 'draft.md');
  const checks = {
    architecture: await exists(path.join(outputsDir, 'architecture.md')),
    outline: await exists(path.join(outputsDir, 'outline.md')),
    draft: await exists(draftPath),
  };
  const chineseChars = checks.draft ? await countChineseCharactersInFile(draftPath) : undefined;
  return { ok: Object.values(checks).every(Boolean), checks, chineseChars };
}

export async function verifyReviewJob(jobDir: string): Promise<{
  ok: boolean;
  checks: Record<string, boolean>;
  quality?: ReviewQualityVerification;
}> {
  const resolvedJobDir = path.resolve(jobDir);
  const checks = {
    cardsDir: await exists(path.join(resolvedJobDir, 'cards')),
    aggregate: await exists(path.join(resolvedJobDir, 'final', 'aggregate.md')),
    manifest: await exists(path.join(resolvedJobDir, 'manifest.json')),
  };
  const quality = checks.cardsDir && checks.manifest
    ? await summarizeReviewQuality(resolvedJobDir)
    : undefined;
  return { ok: Object.values(checks).every(Boolean), checks, quality };
}

export async function verifyWorkflowJob(jobDir: string): Promise<{
  ok: boolean;
  checks: Record<string, boolean>;
  review?: ReviewQualityVerification;
}> {
  const resolvedJobDir = path.join(path.resolve(jobDir));
  const checks = {
    manifest: await exists(path.join(resolvedJobDir, 'manifest.json')),
    runbook: await exists(path.join(resolvedJobDir, 'RUNBOOK.md')),
    state: await exists(path.join(resolvedJobDir, 'runtime', 'state.json')),
  };

  let review: ReviewQualityVerification | undefined;
  if (checks.manifest) {
    review = await summarizeWorkflowReviewQuality(resolvedJobDir);
  }

  return { ok: Object.values(checks).every(Boolean), checks, review };
}

export async function verifyDraftLength(
  draftPath: string,
  minChars: number,
  maxChars: number,
): Promise<{ ok: boolean; chineseChars: number; minChars: number; maxChars: number }> {
  const chineseChars = await countChineseCharactersInFile(draftPath);
  return {
    ok: chineseChars >= minChars && chineseChars <= maxChars,
    chineseChars,
    minChars,
    maxChars,
  };
}

export function parseChineseLengthRange(input: string | undefined): { minChars: number; maxChars: number } {
  const raw = input ?? '8000-12000 Chinese characters';
  const match = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) {
    return { minChars: 8000, maxChars: 12000 };
  }
  return {
    minChars: Number(match[1]),
    maxChars: Number(match[2]),
  };
}

export async function countChineseCharactersInFile(filePath: string): Promise<number> {
  const content = await fs.readFile(filePath, 'utf8');
  return countChineseCharacters(content);
}

export function countChineseCharacters(content: string): number {
  const matches = content.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

async function summarizeWorkflowReviewQuality(jobDir: string): Promise<ReviewQualityVerification | undefined> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(jobDir, 'manifest.json'), 'utf8')) as {
      reviewJobDir?: string;
      sourceOwnership?: SourceOwnership;
    };
    if (!manifest.reviewJobDir) {
      return undefined;
    }
    return summarizeReviewQuality(path.resolve(manifest.reviewJobDir), manifest.sourceOwnership);
  } catch {
    return undefined;
  }
}

async function summarizeReviewQuality(jobDir: string, fallbackOwnership?: SourceOwnership): Promise<ReviewQualityVerification | undefined> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(jobDir, 'manifest.json'), 'utf8')) as {
      sourceOwnership?: SourceOwnership;
    };
    const cards = await loadReviewCards(path.join(jobDir, 'cards'));
    if (cards.length === 0) {
      return undefined;
    }
    const aggregate = aggregateReviewCards(cards, {
      sourceOwnership: manifest.sourceOwnership ?? fallbackOwnership ?? 'third-party',
    });
    return {
      compositeScore: aggregate.compositeScore,
      overallShip: aggregate.overallShip,
      qualityShip: aggregate.qualityShip,
      publishReady: aggregate.publishReadiness.ready,
      failingDimensions: aggregate.publishReadiness.failingDimensions,
    };
  } catch {
    return undefined;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
