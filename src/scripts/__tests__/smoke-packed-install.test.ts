import assert from 'node:assert/strict';
import test from 'node:test';
import { PACKED_INSTALL_SMOKE_CORE_COMMANDS, PACKED_INSTALL_SMOKE_POST_INSTALL_COMMANDS } from '../smoke-packed-install.js';

test('packed install smoke stays limited to help and version boot checks', () => {
  assert.deepEqual(PACKED_INSTALL_SMOKE_CORE_COMMANDS, [
    ['--help'],
    ['--version'],
  ]);
});

test('packed install smoke includes installed setup and doctor verification steps', () => {
  assert.deepEqual(PACKED_INSTALL_SMOKE_POST_INSTALL_COMMANDS, [
    'setup',
    'doctor',
    'run-draft',
    'run-review',
    'run-workflow',
  ]);
});
