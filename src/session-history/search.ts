import fs from 'node:fs/promises';
import path from 'node:path';
import type { OnxRuntimeEvent } from '../events/types.js';

export async function readSessionHistory(projectDir: string): Promise<OnxRuntimeEvent[]> {
  const filePath = path.join(path.resolve(projectDir), '.onx', 'logs', 'session-history.jsonl');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as OnxRuntimeEvent);
  } catch {
    return [];
  }
}

export async function searchSessionHistory(
  projectDir: string,
  options: { mode?: string; kind?: string; last?: number } = {},
): Promise<OnxRuntimeEvent[]> {
  const events = await readSessionHistory(projectDir);
  let filtered = events;
  if (options.mode) {
    filtered = filtered.filter((event) => event.mode === options.mode);
  }
  if (options.kind) {
    filtered = filtered.filter((event) => event.kind === options.kind);
  }
  if (options.last && options.last > 0) {
    filtered = filtered.slice(-options.last);
  }
  return filtered;
}
