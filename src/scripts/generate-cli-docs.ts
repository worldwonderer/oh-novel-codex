#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { renderCliReferenceMarkdown, renderReadmeCommandSnippet } from '../cli/command-metadata.js';

const CHECK_ONLY = process.argv.includes('--check');
const root = process.cwd();
const docsCliPath = join(root, 'docs', 'cli.md');
const readmePath = join(root, 'README.md');

function updateReadme(content: string): string {
  const start = '<!-- ONX:CLI:START -->';
  const end = '<!-- ONX:CLI:END -->';
  const snippet = renderReadmeCommandSnippet().trimEnd();

  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('cli_docs_drift:readme_markers_missing');
  }

  const before = content.slice(0, startIndex);
  const after = content.slice(endIndex + end.length);
  return `${before}${snippet}${after}`;
}

function main(): void {
  const rendered = renderCliReferenceMarkdown();
  const readme = readFileSync(readmePath, 'utf8');
  const nextReadme = updateReadme(readme);

  if (CHECK_ONLY) {
    const existing = readFileSync(docsCliPath, 'utf8');
    if (existing !== rendered) {
      throw new Error('cli_docs_drift:help_doc_mismatch');
    }
    if (readme !== nextReadme) {
      throw new Error('cli_docs_drift:readme_snippet_mismatch');
    }
    console.log('cli docs check ok');
    return;
  }

  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(docsCliPath, rendered);
  writeFileSync(readmePath, nextReadme);
  console.log(`wrote ${docsCliPath}`);
  console.log(`updated ${readmePath}`);
}

main();
