#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { renderDocsIndexMarkdown, renderReadmeDocsSnippet } from '../docs/navigation-metadata.js';

const CHECK_ONLY = process.argv.includes('--check');
const root = process.cwd();
const docsIndexPath = join(root, 'docs', 'index.md');
const readmePath = join(root, 'README.md');

function updateReadme(content: string): string {
  const start = '<!-- ONX:DOCS:START -->';
  const end = '<!-- ONX:DOCS:END -->';
  const snippet = renderReadmeDocsSnippet().trimEnd();

  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('docs_index_drift:readme_markers_missing');
  }

  const before = content.slice(0, startIndex);
  const after = content.slice(endIndex + end.length);
  return `${before}${snippet}${after}`;
}

function main(): void {
  const renderedIndex = renderDocsIndexMarkdown();
  const readme = readFileSync(readmePath, 'utf8');
  const nextReadme = updateReadme(readme);

  if (CHECK_ONLY) {
    const existingIndex = readFileSync(docsIndexPath, 'utf8');
    if (existingIndex !== renderedIndex) {
      throw new Error('docs_index_drift:index_doc_mismatch');
    }
    if (readme !== nextReadme) {
      throw new Error('docs_index_drift:readme_snippet_mismatch');
    }
    console.log('docs index check ok');
    return;
  }

  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(docsIndexPath, renderedIndex);
  writeFileSync(readmePath, nextReadme);
  console.log(`wrote ${docsIndexPath}`);
  console.log(`updated ${readmePath}`);
}

main();
