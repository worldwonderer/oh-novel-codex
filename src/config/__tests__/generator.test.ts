import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { describeProjectScaffold, scaffoldProject } from '../generator.js';

test('scaffoldProject seeds operator-ready state and appends .onx/ to .gitignore', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-generator-'));
  await fs.writeFile(path.join(root, '.gitignore'), 'node_modules/\n', 'utf8');

  const report = await scaffoldProject(root);
  const gitignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  const memory = JSON.parse(await fs.readFile(path.join(root, '.onx', 'project-memory.json'), 'utf8')) as Record<string, unknown>;
  const notepad = await fs.readFile(path.join(root, '.onx', 'notepad.md'), 'utf8');

  assert.equal(report.updatedGitignore, true);
  assert.match(gitignore, /^node_modules\/$/m);
  assert.match(gitignore, /^\.onx\/$/m);
  assert.ok(report.createdDirectories.includes('.onx/state/modes'));
  assert.ok(report.createdDirectories.includes('.onx/revisions/jobs'));
  assert.ok(report.createdDirectories.includes('.onx/team/jobs'));
  assert.ok(report.createdDirectories.includes('.onx/characters'));
  assert.ok(report.createdDirectories.includes('.onx/timeline'));
  assert.ok(report.createdDirectories.includes('.onx/continuity'));
  assert.ok(report.createdFiles.includes('.onx/characters/index.md'));
  assert.ok(report.createdFiles.includes('.onx/voice/index.md'));
  assert.ok(report.createdFiles.includes('.onx/continuity/index.md'));
  assert.ok(report.createdDirectories.includes('.onx/reports'));
  assert.deepEqual(memory, {});
  assert.match(notepad, /# ONX Notepad/);

  await fs.access(path.join(root, '.onx', 'logs', 'events.jsonl'));
  await fs.access(path.join(root, '.onx', 'workflows', 'jobs'));
  await fs.access(path.join(root, '.onx', 'characters', 'index.md'));
  await fs.access(path.join(root, '.onx', 'voice', 'index.md'));
});

test('describeProjectScaffold reports a healthy scaffold after bootstrap', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-generator-status-'));
  await scaffoldProject(root);

  const status = await describeProjectScaffold(root);

  assert.equal(status.ok, true);
  assert.equal(status.directories.missing.length, 0);
  assert.equal(status.files.missing.length, 0);
  assert.equal(status.gitignoreHasOnxEntry, true);
  assert.equal(status.agentsPresent, true);
});
