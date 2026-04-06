import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSendWithCooldown } from '../dispatcher.js';

test('shouldSendWithCooldown suppresses repeated events inside cooldown window', () => {
  const config = { hookCommand: 'echo hi', allowedKinds: null, cooldownMs: 100000 };
  const event = { timestamp: '', projectDir: '/tmp', kind: 'workflow.phase.started' } as const;
  assert.equal(shouldSendWithCooldown(event, config), true);
  assert.equal(shouldSendWithCooldown(event, config), false);
});
