import type { OnxRuntimeEvent } from '../events/types.js';
import type { NotificationConfig } from './config.js';

const cooldownByKey = new Map<string, number>();

export function shouldSendWithCooldown(event: OnxRuntimeEvent, config: NotificationConfig): boolean {
  if (config.cooldownMs <= 0) return true;
  const key = `${event.projectDir}:${event.kind}`;
  const now = Date.now();
  const last = cooldownByKey.get(key) ?? 0;
  if (now - last < config.cooldownMs) return false;
  cooldownByKey.set(key, now);
  return true;
}
