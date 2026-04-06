import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { runCli } from '../index.js';
import { version } from '../version.js';

test('runCli help output lists core commands', async () => {
  const { stdout, stderr, exitCode } = await captureCli(() => runCli(['help']));

  assert.equal(exitCode, undefined);
  assert.equal(stderr, '');
  assert.match(stdout, /oh-novel-codex \(onx\)/);
  assert.match(stdout, /onx doctor \[--codex-home <dir>] \[--project <dir>] \[--json]/);
  assert.match(stdout, /onx review-aggregate <path>/);
  assert.match(stdout, /onx version/);
});

test('runCli --version prints the current package version', async () => {
  const { stdout, stderr, exitCode } = await captureCli(() => runCli(['--version']));

  assert.equal(exitCode, undefined);
  assert.equal(stderr, '');
  assert.equal(stdout.trim(), version);
});

test('runCli unknown command sets exitCode and prints help', async () => {
  const { stdout, stderr, exitCode } = await captureCli(() => runCli(['wat']));

  assert.equal(exitCode, 1);
  assert.match(stderr, /Unknown command: wat/);
  assert.match(stdout, /oh-novel-codex \(onx\)/);
});

async function captureCli(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  let stdout = '';
  let stderr = '';
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalExitCode = process.exitCode;

  const stdoutSink = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      callback();
    },
  });
  const stderrSink = new Writable({
    write(chunk, _encoding, callback) {
      stderr += chunk.toString();
      callback();
    },
  });

  (process.stdout.write as unknown as typeof originalStdoutWrite) = stdoutSink.write.bind(stdoutSink) as typeof originalStdoutWrite;
  (process.stderr.write as unknown as typeof originalStderrWrite) = stderrSink.write.bind(stderrSink) as typeof originalStderrWrite;
  process.exitCode = undefined;

  try {
    await fn();
    return { stdout, stderr, exitCode: process.exitCode };
  } finally {
    (process.stdout.write as unknown as typeof originalStdoutWrite) = originalStdoutWrite;
    (process.stderr.write as unknown as typeof originalStderrWrite) = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}
