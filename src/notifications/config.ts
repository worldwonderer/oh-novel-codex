import type { OnxRuntimeEvent } from '../events/types.js';

export type NotificationConfig = {
  hookCommand?: string;
  allowedKinds: Set<string> | null;
  cooldownMs: number;
};

export function readNotificationConfig(env: NodeJS.ProcessEnv = process.env): NotificationConfig {
  const rawKinds = env.ONX_NOTIFY_EVENTS?.trim();
  const allowedKinds =
    rawKinds && rawKinds.length > 0
      ? new Set(
          rawKinds
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        )
      : null;

  const cooldownMs = Math.max(0, Number(env.ONX_NOTIFY_COOLDOWN_MS ?? '0') || 0);

  return {
    hookCommand: env.ONX_NOTIFY_HOOK,
    allowedKinds,
    cooldownMs,
  };
}

export function shouldDispatchEvent(event: OnxRuntimeEvent, config: NotificationConfig): boolean {
  if (!config.hookCommand) return false;
  if (!config.allowedKinds) return true;
  return config.allowedKinds.has(event.kind);
}
