import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REQUIRED_DOC_LINKS = [
  './getting-started.md',
  './cli.md',
  './release-process.md',
  './skills.md',
  './prompts.md',
  './draft-pipeline.md',
  './review-pipeline.md',
  './revision-pipeline.md',
  './workflow-pipeline.md',
  './team-runtime.md',
  './agents.md',
  './hooks.md',
  './mcp.md',
  './state-memory-trace.md',
  './guidance-schema.md',
  './review-card-contract.md',
] as const;

test('docs index links core ONX documents and README links the docs index', () => {
  const docsIndexPath = join(process.cwd(), 'docs', 'index.md');
  const readmePath = join(process.cwd(), 'README.md');
  assert.equal(existsSync(docsIndexPath), true, `missing file: ${docsIndexPath}`);

  const docsIndex = readFileSync(docsIndexPath, 'utf8');
  const readme = readFileSync(readmePath, 'utf8');

  for (const link of REQUIRED_DOC_LINKS) {
    assert.match(docsIndex, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(readme, /\[docs index\]\(\.\/docs\/index\.md\)/);
});
