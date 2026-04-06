import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { setup } from '../setup.js';
import { update } from '../update.js';

test('setup reports installable catalog counts and scaffold summary', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-setup-home-'));
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-setup-project-'));

  const output = await captureStdout(() => setup([
    '--codex-home', codexHome,
    '--project', projectDir,
  ]));

  assert.match(output, /Installed \d+\/\d+ installable prompts and \d+\/\d+ installable skills/);
  assert.match(output, /Scaffolded ONX project files/);
  await fs.access(path.join(projectDir, 'AGENTS.md'));
  await fs.access(path.join(codexHome, 'prompts', 'novel-architect.md'));
  await fs.access(path.join(codexHome, 'skills', 'novel-interview', 'SKILL.md'));
});

test('update refreshes installable assets and scaffold summary', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-update-home-'));
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-update-project-'));

  await setup([
    '--codex-home', codexHome,
    '--project', projectDir,
  ]);

  const output = await captureStdout(() => update([
    '--codex-home', codexHome,
    '--project', projectDir,
  ]));

  assert.match(output, /Updated \d+\/\d+ installable prompts and \d+\/\d+ installable skills/);
  assert.match(output, /Refreshed ONX project scaffold/);
});

async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  let output = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  (process.stdout.write as unknown as typeof originalWrite) = sink.write.bind(sink) as typeof originalWrite;
  try {
    await fn();
  } finally {
    (process.stdout.write as unknown as typeof originalWrite) = originalWrite;
  }
  return output;
}
