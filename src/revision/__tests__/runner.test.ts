import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewJob } from '../../review/runner.js';
import { executeReviewJob } from '../../review/runner.js';
import { createRevisionJob } from '../runner.js';

test('createRevisionJob scaffolds quality-focused revision prompts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft\n', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    projectDir: root,
  });
  await executeReviewJob({ jobDir: reviewJob.jobDir, dryRun: true });

  const revision = await createRevisionJob({
    draftPath: draft,
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
    focus: 'quality',
  });

  const prompts = await fs.readdir(revision.promptsDir);
  assert.ok(prompts.includes('01-fix-plan.md'));
  assert.ok(prompts.includes('02-revision-writer.md'));
  const brief = await fs.readFile(path.join(revision.jobDir, 'brief.md'), 'utf8');
  assert.match(brief, /Publish quality verdict/);
});
