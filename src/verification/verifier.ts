import fs from 'node:fs/promises';
import path from 'node:path';

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

export async function verifyReviewJob(jobDir: string): Promise<{ ok: boolean; checks: Record<string, boolean> }> {
  const checks = {
    cardsDir: await exists(path.join(path.resolve(jobDir), 'cards')),
    aggregate: await exists(path.join(path.resolve(jobDir), 'final', 'aggregate.md')),
    manifest: await exists(path.join(path.resolve(jobDir), 'manifest.json')),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export async function verifyWorkflowJob(jobDir: string): Promise<{ ok: boolean; checks: Record<string, boolean> }> {
  const checks = {
    manifest: await exists(path.join(path.resolve(jobDir), 'manifest.json')),
    runbook: await exists(path.join(path.resolve(jobDir), 'RUNBOOK.md')),
    state: await exists(path.join(path.resolve(jobDir), 'runtime', 'state.json')),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
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

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
