import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('showcase docs and local runner exist and are discoverable', () => {
  const root = process.cwd();
  const showcaseDoc = join(root, 'docs', 'showcase-zhihu-remix-automation.md');
  const showcaseReadme = join(root, 'playground', 'showcases', 'zhihu-remix-automation', 'README.md');
  const showcaseBrief = join(root, 'playground', 'showcases', 'zhihu-remix-automation', 'demo-brief.md');
  const showcaseRunner = join(root, 'playground', 'showcases', 'zhihu-remix-automation', 'run-local-demo.mjs');
  const docsIndex = readFileSync(join(root, 'docs', 'index.md'), 'utf8');
  const playgroundReadme = readFileSync(join(root, 'playground', 'README.md'), 'utf8');

  for (const file of [showcaseDoc, showcaseReadme, showcaseBrief, showcaseRunner]) {
    assert.equal(existsSync(file), true, `missing file: ${file}`);
  }

  assert.match(docsIndex, /\[Zhihu remix automation showcase\]\(\.\/showcase-zhihu-remix-automation\.md\)/);
  assert.match(playgroundReadme, /showcases\/zhihu-remix-automation/);
});
