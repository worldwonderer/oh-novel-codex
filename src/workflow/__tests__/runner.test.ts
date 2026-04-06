import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowJob } from '../runner.js';

test('createWorkflowJob scaffolds draft and review jobs together', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-job-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source story', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '改成知乎体长稿',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
    jobName: 'workflow-demo',
  });

  const manifest = JSON.parse(await fs.readFile(workflow.manifestPath, 'utf8')) as {
    draftJobDir: string;
    reviewJobDir: string;
    aggregateCommand: string;
  };

  assert.match(manifest.draftJobDir, /\.onx\/drafts\/jobs\//);
  assert.match(manifest.reviewJobDir, /\.onx\/reviews\/jobs\//);
  assert.match(manifest.aggregateCommand, /run-review --job/);
});
