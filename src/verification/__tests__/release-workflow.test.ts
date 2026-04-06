import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('release workflow enforces version sync before cross-platform smoke and npm publish', () => {
  const workflowPath = join(process.cwd(), '.github', 'workflows', 'release.yml');
  assert.equal(existsSync(workflowPath), true, `missing workflow: ${workflowPath}`);

  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /name:\s*Release/);
  assert.match(workflow, /push:\s*\n\s*tags:/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /verify-version-sync:/);
  assert.match(workflow, /quality:/);
  assert.match(workflow, /smoke-packed-install:/);
  assert.match(workflow, /publish-npm:/);
  assert.match(workflow, /needs:\s*\[verify-version-sync\]/);
  assert.match(workflow, /needs:\s*\[quality\]/);
  assert.match(workflow, /needs:\s*\[smoke-packed-install\]/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*20/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run smoke:packed-install/);
  assert.match(workflow, /npm pack --dry-run/);
  assert.match(workflow, /npm publish --access public --provenance/);
  assert.match(workflow, /matrix:\s*\n\s*os:\s*\[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(workflow, /package\.json version/);
  assert.match(workflow, /catalogVersion/);
});
