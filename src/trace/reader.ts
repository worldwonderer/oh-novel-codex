import fs from 'node:fs/promises';
import path from 'node:path';

export type TraceEvent = Record<string, unknown> & {
  timestamp?: string;
  kind?: string;
  mode?: string;
  phase?: string;
};

export async function readTrace(projectDir: string): Promise<TraceEvent[]> {
  const filePath = tracePath(projectDir);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TraceEvent);
  } catch {
    return [];
  }
}

export async function summarizeTrace(projectDir: string): Promise<{
  count: number;
  byKind: Record<string, number>;
  latest?: TraceEvent;
}> {
  const events = await readTrace(projectDir);
  const byKind: Record<string, number> = {};
  for (const event of events) {
    const kind = event.kind ?? 'unknown';
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
  return {
    count: events.length,
    byKind,
    latest: events.at(-1),
  };
}

export function tracePath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'logs', 'events.jsonl');
}
