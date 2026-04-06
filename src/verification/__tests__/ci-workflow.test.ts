import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('ci workflow runs build, lint, test, and packed-install smoke gates', () => {
  const workflowPath = join(process.cwd(), '.github', 'workflows', 'ci.yml');
  assert.equal(existsSync(workflowPath), true, `missing workflow: ${workflowPath}`);

  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /name:\s*CI/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /quality:/);
  assert.match(workflow, /packed-install-smoke:/);
  assert.match(workflow, /needs:\s*\[quality\]/);
  assert.match(workflow, /strategy:\s*\n\s*fail-fast:\s*false\s*\n\s*matrix:/);
  assert.match(workflow, /os:\s*\[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(workflow, /runs-on:\s*\$\{\{\s*matrix\.os\s*\}\}/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /node-version:\s*20/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run smoke:packed-install/);
});
