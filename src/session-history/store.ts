import fs from 'node:fs/promises';
import path from 'node:path';
import type { OnxRuntimeEvent } from '../events/types.js';

export async function appendSessionHistory(event: OnxRuntimeEvent): Promise<void> {
  const historyPath = path.join(event.projectDir, '.onx', 'logs', 'session-history.jsonl');
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.appendFile(historyPath, `${JSON.stringify(event)}\n`, 'utf8');
}
