import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowJob } from '../runner.js';
import { executeWorkflowJob, getWorkflowStatus } from '../execute.js';
import { readWorkflowState } from '../state.js';

test('workflow state tracks completed phases after dry-run execution', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-workflow-state-'));
  const source = path.join(root, 'source.txt');
  await fs.writeFile(source, 'source', 'utf8');

  const workflow = await createWorkflowJob({
    brief: '改成知乎体长稿',
    sourcePath: source,
    projectDir: root,
    mode: 'zhihu-remix',
  });

  await executeWorkflowJob({ jobDir: workflow.jobDir, dryRun: true });
  const state = await readWorkflowState(path.join(workflow.jobDir, 'runtime', 'state.json'));
  assert.ok(state.phases.every((phase) => phase.status === 'completed'));
  const status = await getWorkflowStatus(workflow.jobDir);
  assert.match(status, /review:aggregate/);
  assert.match(status, /completed/);
});
