import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftJob } from '../runner.js';

test('createDraftJob scaffolds original draft workflow', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-draft-job-'));
  const job = await createDraftJob({
    brief: '写一个知乎体复仇短篇',
    projectDir: root,
    jobName: 'original-demo',
  });

  const promptFiles = await fs.readdir(job.promptsDir);
  assert.ok(promptFiles.includes('01-novel-architect.md'));
  assert.ok(promptFiles.includes('03-scene-writer.md'));
  const manifest = JSON.parse(await fs.readFile(job.manifestPath, 'utf8')) as { mode: string };
  assert.equal(manifest.mode, 'draft-longform');
});

test('createDraftJob requires source for zhihu-remix mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-draft-job-remix-'));
  await assert.rejects(
    createDraftJob({
      brief: '改成知乎体',
      projectDir: root,
      mode: 'zhihu-remix',
    }),
    /requires --source/,
  );
});

test('createDraftJob scaffolds rewrite workflow with source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-draft-job-source-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source story', 'utf8');
  const job = await createDraftJob({
    brief: '做低相似度重写',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
  });

  const readme = await fs.readFile(path.join(job.jobDir, 'README.md'), 'utf8');
  assert.match(readme, /zhihu-remix/);
  const handoff = await fs.readFile(path.join(job.handoffDir, 'review-brief.md'), 'utf8');
  assert.match(handoff, /skeleton remix depth/);
});
