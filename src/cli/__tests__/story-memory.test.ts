import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { continuityReport } from '../continuity-report.js';
import { storyRead } from '../story-read.js';
import { storyWrite } from '../story-write.js';

test('story-write and story-read use collection/key semantics', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-cli-story-memory-'));

  const writeOutput = await captureStdout(() => storyWrite([
    '--project', root,
    '--collection', 'characters',
    '--key', 'lead-hero',
    '--text', '# Hero\n\nDrives the plot.\n',
  ]));
  const written = JSON.parse(writeOutput) as { collection: string; key: string; path: string };
  assert.equal(written.collection, 'characters');
  assert.equal(written.key, 'lead-hero');

  const readOutput = await captureStdout(() => storyRead([
    '--project', root,
    '--collection', 'characters',
    '--key', 'lead-hero',
  ]));
  assert.match(readOutput, /# Hero/);

  const listOutput = await captureStdout(() => storyRead([
    '--project', root,
    '--collection', 'characters',
  ]));
  assert.match(listOutput, /lead-hero: Hero/);
});

test('continuity-report summarizes collection counts and warnings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-cli-continuity-'));
  const draft = path.join(root, 'draft.md');
  await storyWrite([
    '--project', root,
    '--collection', 'continuity',
    '--key', 'chapter-01',
    '--text', '# Chapter 01 continuity\n\n- [ ] Bracelet stays jade.\n- [x] Company name is aligned.\n',
  ]);
  await storyWrite([
    '--project', root,
    '--collection', 'characters',
    '--key', 'lead-hero',
    '--text', '# Lead Hero\n\nLead Hero\n',
  ]);
  await fs.writeFile(draft, '# Draft\n\nNo hero name yet.\n', 'utf8');

  const output = await captureStdout(() => continuityReport(['--project', root, '--draft', draft]));
  assert.match(output, /# ONX Continuity Report/);
  assert.match(output, /Unresolved items: 1/);
  assert.match(output, /Resolved items: 1/);
  assert.match(output, /## Collection counts/);
  assert.match(output, /characters:/);
  assert.match(output, /## Draft coverage/);
  assert.match(output, /Missing keywords:/);
});

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  let output = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  (process.stdout.write as unknown as typeof originalWrite) = sink.write.bind(sink) as typeof originalWrite;
  try {
    await fn();
  } finally {
    (process.stdout.write as unknown as typeof originalWrite) = originalWrite;
  }
  return output;
}
