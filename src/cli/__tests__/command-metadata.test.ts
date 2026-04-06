import assert from 'node:assert/strict';
import test from 'node:test';
import { CLI_COMMAND_DEFINITIONS, renderCliReferenceMarkdown, renderHelpText, renderReadmeCommandSnippet } from '../command-metadata.js';

test('CLI command metadata has stable unique ids', () => {
  const ids = CLI_COMMAND_DEFINITIONS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('rendered help text includes every declared syntax line', () => {
  const help = renderHelpText();
  for (const entry of CLI_COMMAND_DEFINITIONS) {
    assert.match(help, new RegExp(entry.syntax.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('CLI markdown and README snippet are derived from the same metadata source', () => {
  const docs = renderCliReferenceMarkdown();
  const snippet = renderReadmeCommandSnippet();

  assert.match(docs, /Auto-generated from `src\/cli\/command-metadata\.ts`/);
  assert.match(snippet, /<!-- ONX:CLI:START -->/);
  assert.match(snippet, /run-workflow/);
});
