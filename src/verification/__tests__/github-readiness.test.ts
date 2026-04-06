import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('github readiness files and package metadata are present', () => {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    repository?: { type?: string; url?: string };
    homepage?: string;
    bugs?: { url?: string };
  };
  const readme = readFileSync(join(root, 'README.md'), 'utf8');

  const requiredFiles = [
    'CONTRIBUTING.md',
    'SECURITY.md',
    '.github/CODEOWNERS',
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/pull_request_template.md',
  ];

  for (const relative of requiredFiles) {
    assert.equal(existsSync(join(root, relative)), true, `missing file: ${relative}`);
  }

  assert.equal(packageJson.repository?.type, 'git');
  assert.match(packageJson.repository?.url ?? '', /github\.com\/.+\/oh-novel-codex\.git/);
  assert.match(packageJson.homepage ?? '', /github\.com\/.+\/oh-novel-codex#readme/);
  assert.match(packageJson.bugs?.url ?? '', /github\.com\/.+\/oh-novel-codex\/issues/);

  assert.match(readme, /\[Contributing guide\]\(\.\/CONTRIBUTING\.md\)/);
  assert.match(readme, /\[Security policy\]\(\.\/SECURITY\.md\)/);
  assert.match(readme, /\[NOTICE\.md\]\(\.\/NOTICE\.md\)/);
});
