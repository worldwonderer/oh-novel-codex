import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCS_SECTIONS, renderDocsIndexMarkdown, renderReadmeDocsSnippet } from '../navigation-metadata.js';

test('docs navigation metadata has stable unique section ids', () => {
  const ids = DOCS_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('docs index and README docs snippet are derived from the same metadata source', () => {
  const docsIndex = renderDocsIndexMarkdown();
  const readmeSnippet = renderReadmeDocsSnippet();

  assert.match(docsIndex, /# ONX Docs Index/);
  assert.match(readmeSnippet, /<!-- ONX:DOCS:START -->/);
  assert.match(readmeSnippet, /\[docs index\]\(\.\/docs\/index\.md\)/);
});
