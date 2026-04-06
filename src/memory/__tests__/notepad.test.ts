import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendManual, appendWorking, readNotepad, writePriority } from '../notepad.js';

test('notepad can write and read sections', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-notepad-'));
  await writePriority(root, 'focus on ending strength');
  await appendWorking(root, 'draft chapter 4');
  await appendManual(root, 'never flatten the ending');

  const priority = await readNotepad(root, 'priority');
  const working = await readNotepad(root, 'working');
  const manual = await readNotepad(root, 'manual');

  assert.match(priority, /focus on ending strength/);
  assert.match(working, /draft chapter 4/);
  assert.match(manual, /never flatten the ending/);
});
