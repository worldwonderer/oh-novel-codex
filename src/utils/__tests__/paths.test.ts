import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getCodexHome, getInstallTargets } from '../paths.js';

test('getCodexHome respects CODEX_HOME', () => {
  const home = getCodexHome({ CODEX_HOME: '/tmp/custom-codex' } as NodeJS.ProcessEnv);
  assert.equal(home, path.resolve('/tmp/custom-codex'));
});

test('getInstallTargets appends prompts and skills', () => {
  const targets = getInstallTargets('/tmp/codex-home');
  assert.equal(targets.promptsDir, '/tmp/codex-home/prompts');
  assert.equal(targets.skillsDir, '/tmp/codex-home/skills');
});
