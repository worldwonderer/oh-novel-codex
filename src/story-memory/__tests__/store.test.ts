import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContinuityReport,
  buildStoryMemorySnapshot,
  ensureStoryMemoryScaffold,
  listStoryMemoryEntries,
  storyMemoryStarterPath,
  storyMemoryEntryPath,
  writeStoryMemoryEntry,
} from '../store.js';

test('ensureStoryMemoryScaffold seeds starter files for every collection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-story-scaffold-'));

  const report = await ensureStoryMemoryScaffold(root);

  assert.ok(report.createdDirectories.includes('.onx/characters'));
  assert.ok(report.createdDirectories.includes('.onx/continuity'));
  assert.ok(report.createdFiles.includes('.onx/characters/index.md'));
  assert.ok(report.createdFiles.includes('.onx/voice/index.md'));
  await fs.access(storyMemoryStarterPath(root, 'characters'));
  await fs.access(storyMemoryStarterPath(root, 'continuity'));
});

test('writeStoryMemoryEntry persists markdown entries and listStoryMemoryEntries summarizes them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-story-memory-'));
  await writeStoryMemoryEntry(root, 'characters', 'Lead Hero', '# Hero\n\nDrives the plot.\n');

  const entries = await listStoryMemoryEntries(root, 'characters');

  assert.ok(entries.length >= 2);
  const hero = entries.find((entry) => entry.key === 'lead-hero');
  assert.ok(hero);
  assert.equal(hero?.title, 'Hero');
  assert.equal(hero?.preview, 'Drives the plot.');
  await fs.access(storyMemoryEntryPath(root, 'characters', 'Lead Hero'));
});

test('buildContinuityReport counts resolved and unresolved checklist items', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-story-continuity-'));
  await writeStoryMemoryEntry(
    root,
    'continuity',
    'chapter-01',
    '# Chapter 01 continuity\n\n- [ ] The bracelet color must stay jade.\n- [x] The company name now matches the contract.\n',
  );

  const report = await buildContinuityReport(root);

  assert.equal(report.unresolvedCount, 1);
  assert.equal(report.resolvedCount, 1);
  assert.ok(report.collectionCounts.continuity >= 1);
  assert.ok(report.continuityEntries.some((entry) => entry.key === 'chapter-01'));
  assert.ok(report.warnings.some((warning) => warning.includes('character bible')));
});

test('buildStoryMemorySnapshot renders every collection and continuity summary', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-story-snapshot-'));
  await writeStoryMemoryEntry(root, 'world', 'setting', '# Setting\n\nCorporate revenge world.\n');
  await writeStoryMemoryEntry(root, 'voice', 'default', '# Default voice\n\nTight first-person, mobile-readable.\n');

  const snapshot = await buildStoryMemorySnapshot(root);

  assert.match(snapshot, /# Story memory snapshot/);
  assert.match(snapshot, /## World/);
  assert.match(snapshot, /## Voice/);
  assert.match(snapshot, /## Continuity summary/);
});
