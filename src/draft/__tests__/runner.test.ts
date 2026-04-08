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
  const outlinePrompt = await fs.readFile(path.join(job.promptsDir, '02-outline-planner.md'), 'utf8');
  assert.match(outlinePrompt, /source-shadow inventory/);
  assert.match(outlinePrompt, /character agency map/);
  const scenePrompt = await fs.readFile(path.join(job.promptsDir, '03-scene-writer.md'), 'utf8');
  assert.match(scenePrompt, /public discovery -> scolding call -> public downgrade -> public detonation -> repeated return visits/);
  assert.match(scenePrompt, /public-display discovery -> same-night confrontation -> next-day visual confirmation/);
  assert.match(scenePrompt, /the rival is wearing the heroine’s ceremonial object for an important visit/);
  assert.match(scenePrompt, /symbolic object may not serve as opener trigger, public humiliation prop, and ending closure device all at once/);
  assert.match(scenePrompt, /symbolic object should keep at most one major story job/);
  assert.match(scenePrompt, /formal ceremony \/ signing \/ registration table as a near-substitute public reveal/);
  assert.match(scenePrompt, /ex-partner pleading -> public disgrace recap -> months-later stage declaration/);
  assert.match(scenePrompt, /doorstep pleading scene with the same thesis line/);
  assert.match(scenePrompt, /delay symbolic-object backstory until after the protagonist takes an action turn/);
  assert.match(scenePrompt, /do not append news-cycle noise or a second thesis paragraph/);
  assert.match(scenePrompt, /The rival must want something concrete beyond being chosen/);
  assert.match(scenePrompt, /At least one ally must refuse, delay, or attach a condition/);
  assert.match(scenePrompt, /Make at least one non-hero character take an action that changes the plot/);
  assert.match(scenePrompt, /By the first 2-3 paragraphs, establish both the external system risk and the heroine’s private loss/);
  assert.match(scenePrompt, /Do not let two adjacent middle-act scenes do the same dramatic job/);
  assert.match(scenePrompt, /distinct speech textures, decision criteria, and fears/);
  assert.match(scenePrompt, /choose one dominant kill-shot image or sound and one dominant quote-line/);
});
