import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTmuxLayoutGuard, inspectTmuxPane, nudgeTmuxPane, paneLooksReady, readTmuxPaneHealth } from '../tmux.js';

test('paneLooksReady detects shell prompts', () => {
  assert.equal(paneLooksReady('user@host %'), true);
  assert.equal(paneLooksReady('still working...'), false);
});

test('inspectTmuxPane reads pane mode, command, and capture', async () => {
  const calls: string[][] = [];
  const fakeExecFile = ((_file: string, args: readonly string[], callback: (error: Error | null, stdout?: string) => void) => {
    calls.push([_file, ...args]);
    if (args[0] === 'display-message') callback(null, '0\t0\tzsh');
    else callback(null, 'user@host %');
    return {} as never;
  }) as unknown as typeof import('node:child_process').execFile;

  const pane = await inspectTmuxPane('%1', 'tmux', fakeExecFile);
  assert.equal(pane.dead, false);
  assert.equal(pane.inMode, false);
  assert.equal(pane.currentCommand, 'zsh');
  assert.equal(pane.capture, 'user@host %');
  assert.equal(calls.length, 2);
});

test('readTmuxPaneHealth marks narrow panes unhealthy', async () => {
  const fakeExecFile = ((_file: string, args: readonly string[], callback: (error: Error | null, stdout?: string) => void) => {
    if (args[0] === 'display-message') callback(null, '0\t0\tzsh\t5\t10');
    else callback(null, 'user@host %');
    return {} as never;
  }) as unknown as typeof import('node:child_process').execFile;

  const health = await readTmuxPaneHealth('%8', 'tmux', fakeExecFile);
  assert.equal(health.ok, false);
  assert.equal(health.reason, 'pane_too_narrow');
});

test('nudgeTmuxPane refuses to nudge when pane is in copy-mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-tmux-copy-'));
  const fakeExecFile = ((_file: string, args: readonly string[], callback: (error: Error | null, stdout?: string) => void) => {
    if (args[0] === 'display-message') callback(null, '0\t1\tzsh');
    else callback(null, 'user@host %');
    return {} as never;
  }) as unknown as typeof import('node:child_process').execFile;

  const result = await nudgeTmuxPane(root, {
    pane: '%2',
    key: 'workflow:job:phase',
    message: 'continue',
    cooldownMs: 0,
  }, { execFile: fakeExecFile });

  assert.equal(result.nudged, false);
  assert.equal(result.reason, 'pane_in_copy_mode');
});

test('nudgeTmuxPane refuses to nudge dead panes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-tmux-dead-'));
  const fakeExecFile = ((_file: string, args: readonly string[], callback: (error: Error | null, stdout?: string) => void) => {
    if (args[0] === 'display-message') callback(null, '1\t0\tzsh');
    else callback(null, '');
    return {} as never;
  }) as unknown as typeof import('node:child_process').execFile;

  const result = await nudgeTmuxPane(root, {
    pane: '%2',
    key: 'workflow:job:phase',
    message: 'continue',
    cooldownMs: 0,
  }, { execFile: fakeExecFile });

  assert.equal(result.nudged, false);
  assert.equal(result.reason, 'pane_dead');
});

test('nudgeTmuxPane stops after max nudges in the active window', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-tmux-max-'));
  const fakeExecFile = ((_file: string, args: readonly string[], callback: (error: Error | null, stdout?: string) => void) => {
    if (args[0] === 'display-message') callback(null, '0\t0\tzsh');
    else callback(null, 'user@host %');
    return {} as never;
  }) as unknown as typeof import('node:child_process').execFile;

  const envBackup = {
    ONX_TMUX_NUDGE_MAX_COUNT: process.env.ONX_TMUX_NUDGE_MAX_COUNT,
    ONX_TMUX_NUDGE_WINDOW_MS: process.env.ONX_TMUX_NUDGE_WINDOW_MS,
  };
  process.env.ONX_TMUX_NUDGE_MAX_COUNT = '2';
  process.env.ONX_TMUX_NUDGE_WINDOW_MS = '60000';
  try {
    const first = await nudgeTmuxPane(root, {
      pane: '%2',
      key: 'workflow:job:phase',
      message: 'continue',
      cooldownMs: 0,
    }, { execFile: fakeExecFile });
    const second = await nudgeTmuxPane(root, {
      pane: '%2',
      key: 'workflow:job:phase',
      message: 'continue',
      cooldownMs: 0,
    }, { execFile: fakeExecFile });
    const third = await nudgeTmuxPane(root, {
      pane: '%2',
      key: 'workflow:job:phase',
      message: 'continue',
      cooldownMs: 0,
    }, { execFile: fakeExecFile });

    assert.equal(first.reason, 'sent');
    assert.equal(second.reason, 'sent');
    assert.equal(third.reason, 'max_nudges_exhausted');
  } finally {
    process.env.ONX_TMUX_NUDGE_MAX_COUNT = envBackup.ONX_TMUX_NUDGE_MAX_COUNT;
    process.env.ONX_TMUX_NUDGE_WINDOW_MS = envBackup.ONX_TMUX_NUDGE_WINDOW_MS;
  }
});

test('applyTmuxLayoutGuard attempts resize/layout and returns healthy after improvement', async () => {
  const calls: string[][] = [];
  let phase = 'before';
  const fakeExecFile = ((_file: string, args: readonly string[], callback: (error: Error | null, stdout?: string) => void) => {
    calls.push([_file, ...args]);
    if (args[0] === 'display-message') {
      callback(null, phase === 'before' ? '0\t0\tzsh\t5\t5' : '0\t0\tzsh\t120\t30');
    } else if (args[0] === 'capture-pane') {
      callback(null, 'user@host %');
    } else {
      phase = 'after';
      callback(null, '');
    }
    return {} as never;
  }) as unknown as typeof import('node:child_process').execFile;

  const result = await applyTmuxLayoutGuard('%9', {}, { execFile: fakeExecFile });
  assert.equal(result.reason, 'resized');
  assert.equal(result.after.ok, true);
  assert.ok(calls.some((args) => args[1] === 'resize-window'));
  assert.ok(calls.some((args) => args[1] === 'select-layout'));
});
