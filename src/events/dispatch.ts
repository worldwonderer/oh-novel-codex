import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { OnxRuntimeEvent } from './types.js';
import { shouldSendWithCooldown } from '../notifications/dispatcher.js';
import { readNotificationConfig, shouldDispatchEvent } from '../notifications/config.js';
import { appendSessionHistory } from '../session-history/store.js';

export async function dispatchEvent(
  projectDir: string,
  event: Omit<OnxRuntimeEvent, 'timestamp' | 'projectDir'>,
  options: { hookCommand?: string } = {},
): Promise<OnxRuntimeEvent> {
  const runtimeEvent: OnxRuntimeEvent = {
    timestamp: new Date().toISOString(),
    projectDir: path.resolve(projectDir),
    ...event,
  };

  await appendEventLog(runtimeEvent);
  await appendSessionHistory(runtimeEvent);
  const config = readNotificationConfig({
    ...process.env,
    ...(options.hookCommand ? { ONX_NOTIFY_HOOK: options.hookCommand } : {}),
  });
  if (shouldDispatchEvent(runtimeEvent, config) && shouldSendWithCooldown(runtimeEvent, config)) {
    await invokeHook(config.hookCommand!, runtimeEvent);
  }
  return runtimeEvent;
}

async function appendEventLog(event: OnxRuntimeEvent): Promise<void> {
  const logPath = path.join(event.projectDir, '.onx', 'logs', 'events.jsonl');
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
}

async function invokeHook(command: string, event: OnxRuntimeEvent): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd: event.projectDir,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ONX hook failed with exit code ${code}`));
    });
    child.stdin.write(`${JSON.stringify(event)}\n`);
    child.stdin.end();
  });
}
