import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewJob, executeReviewJob } from '../../review/runner.js';
import { createRevisionJob } from '../runner.js';
import { executeRevisionJob, getRevisionStatus } from '../execute.js';

test('executeRevisionJob runs revision phases in dry-run mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-exec-'));
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
  });

  const result = await executeRevisionJob({
    jobDir: revision.jobDir,
    dryRun: true,
  });

  assert.ok(result.phases.length >= 2);
  const status = await getRevisionStatus(revision.jobDir);
  assert.match(status, /completed/);
});
