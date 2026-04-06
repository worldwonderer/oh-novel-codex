import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { doctor } from '../doctor.js';
import { installAssets } from '../../config/generator.js';

test('doctor --json reports healthy global assets and project scaffold', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-doctor-home-'));
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-doctor-project-'));
  await installAssets({ codexHome, projectDir });

  const output = await captureStdout(() => doctor([
    '--codex-home', codexHome,
    '--project', projectDir,
    '--json',
  ]));
  const report = JSON.parse(output) as {
    ok: boolean;
    prompts: { missing: string[] };
    skills: { missing: string[] };
    project?: { ok: boolean; directories: { missing: string[] }; files: { missing: string[] } };
  };

  assert.equal(report.ok, true);
  assert.deepEqual(report.prompts.missing, []);
  assert.deepEqual(report.skills.missing, []);
  assert.equal(report.project?.ok, true);
  assert.deepEqual(report.project?.directories.missing, []);
  assert.deepEqual(report.project?.files.missing, []);
});

test('doctor --json surfaces incomplete project scaffolds', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-doctor-home-missing-'));
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-doctor-project-missing-'));
  await installAssets({ codexHome });
  await fs.writeFile(path.join(projectDir, '.gitignore'), 'dist/\n', 'utf8');

  const output = await captureStdout(() => doctor([
    '--codex-home', codexHome,
    '--project', projectDir,
    '--json',
  ]));
  const report = JSON.parse(output) as {
    ok: boolean;
    project?: {
      ok: boolean;
      gitignoreHasOnxEntry: boolean;
      directories: { missing: string[] };
      files: { missing: string[] };
    };
  };

  assert.equal(report.ok, false);
  assert.equal(report.project?.ok, false);
  assert.equal(report.project?.gitignoreHasOnxEntry, false);
  assert.ok(report.project?.directories.missing.includes('.onx/state/modes'));
  assert.ok(report.project?.files.missing.includes('AGENTS.md'));
  assert.ok(report.project?.files.missing.includes('.onx/notepad.md'));
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
