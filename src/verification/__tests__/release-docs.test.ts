import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('release docs exist and stay aligned with the release workflow', () => {
  const changelogPath = join(process.cwd(), 'CHANGELOG.md');
  const releaseBodyPath = join(process.cwd(), 'RELEASE_BODY.md');
  const releaseProcessPath = join(process.cwd(), 'docs', 'release-process.md');
  const workflowPath = join(process.cwd(), '.github', 'workflows', 'release.yml');

  assert.equal(existsSync(changelogPath), true, `missing file: ${changelogPath}`);
  assert.equal(existsSync(releaseBodyPath), true, `missing file: ${releaseBodyPath}`);
  assert.equal(existsSync(releaseProcessPath), true, `missing file: ${releaseProcessPath}`);

  const changelog = readFileSync(changelogPath, 'utf8');
  const releaseBody = readFileSync(releaseBodyPath, 'utf8');
  const releaseProcess = readFileSync(releaseProcessPath, 'utf8');
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(changelog, /## Unreleased/);
  assert.match(changelog, /## 0\.1\.0/);

  assert.match(releaseBody, /# oh-novel-codex v0\.1\.0/);
  assert.match(releaseBody, /npm run smoke:packed-install/);

  assert.match(releaseProcess, /CHANGELOG\.md/);
  assert.match(releaseProcess, /RELEASE_BODY\.md/);
  assert.match(releaseProcess, /git tag v<package-version>/);

  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(workflow, /body_path:\s*RELEASE_BODY\.md/);
});
