import test from 'node:test';
import assert from 'node:assert/strict';
import { readNotificationConfig, shouldDispatchEvent } from '../config.js';

test('readNotificationConfig parses allowlist and cooldown', () => {
  const config = readNotificationConfig({
    ONX_NOTIFY_HOOK: 'echo hi',
    ONX_NOTIFY_EVENTS: 'workflow.phase.failed,team.lane.failed',
    ONX_NOTIFY_COOLDOWN_MS: '5000',
  } as NodeJS.ProcessEnv);
  assert.equal(config.hookCommand, 'echo hi');
  assert.equal(config.cooldownMs, 5000);
  assert.ok(config.allowedKinds?.has('workflow.phase.failed'));
});

test('shouldDispatchEvent respects allowlist', () => {
  const config = readNotificationConfig({
    ONX_NOTIFY_HOOK: 'echo hi',
    ONX_NOTIFY_EVENTS: 'workflow.phase.failed',
  } as NodeJS.ProcessEnv);
  assert.equal(
    shouldDispatchEvent(
      { timestamp: '', projectDir: '/tmp', kind: 'workflow.phase.failed' },
      config,
    ),
    true,
  );
  assert.equal(
    shouldDispatchEvent(
      { timestamp: '', projectDir: '/tmp', kind: 'review.phase.completed' },
      config,
    ),
    false,
  );
});
