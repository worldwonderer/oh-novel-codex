import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewJob, executeReviewJob, getReviewStatus } from '../runner.js';

test('executeReviewJob runs review phases in dry-run mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-review-exec-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft', 'utf8');

  const job = await createReviewJob({
    draftPath: draft,
    projectDir: root,
  });

  const summary = await executeReviewJob({
    jobDir: job.jobDir,
    dryRun: true,
    parallel: true,
  });

  assert.ok(summary.phases.length >= 5);
  const aggregate = await fs.readFile(summary.aggregatePath, 'utf8');
  assert.match(aggregate, /ONX Review Aggregate/);
  const status = await getReviewStatus(job.jobDir);
  assert.match(status, /aggregate \| completed/);
});
