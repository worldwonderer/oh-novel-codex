import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promptOutputsMaterialized, runCodexPromptFile, runMonitoredCommand } from '../codex.js';

test('dry-run codex execution materializes draft outputs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-runtime-dry-'));
  const prompt = path.join(root, 'prompt.md');
  const output = path.join(root, 'outputs', 'draft.md');
  await fs.writeFile(
    prompt,
    `# Draft task: scene-writer\n\nWrite finished draft to: ${output}\n`,
    'utf8',
  );

  const result = await runCodexPromptFile({
    promptPath: prompt,
    projectDir: root,
    logPath: path.join(root, 'logs', 'phase.log'),
    lastMessagePath: path.join(root, 'logs', 'phase.last.md'),
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  const content = await fs.readFile(output, 'utf8');
  assert.match(content, /DRY RUN OUTPUT/);
  assert.equal(result.attempts, 0);
});

test('dry-run codex execution materializes review cards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-runtime-card-'));
  const prompt = path.join(root, 'prompt.md');
  const output = path.join(root, 'cards', 'hook-doctor.md');
  await fs.writeFile(
    prompt,
    `# Review task: hook-doctor\n\nOutput card: ${output}\n`,
    'utf8',
  );

  await runCodexPromptFile({
    promptPath: prompt,
    projectDir: root,
    logPath: path.join(root, 'logs', 'hook.log'),
    lastMessagePath: path.join(root, 'logs', 'hook.last.md'),
    dryRun: true,
  });

  const card = await fs.readFile(output, 'utf8');
  assert.match(card, /reviewer: hook-doctor/);
  assert.match(card, /# Review card/);
});

test('runMonitoredCommand retries once after a stall and then succeeds', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-runtime-retry-'));
  const marker = path.join(root, 'attempt.txt');
  const script = path.join(root, 'script.mjs');
  await fs.writeFile(
    script,
    `
import fs from 'node:fs';
const marker = process.argv[2];
const count = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
fs.writeFileSync(marker, String(count + 1));
if (count === 0) {
  setTimeout(() => {}, 1000000);
} else {
  process.stdout.write('ok');
}
`,
    'utf8',
  );

  const result = await runMonitoredCommand(
    ['node', script, marker],
    '',
    {
      projectDir: root,
      logPath: path.join(root, 'run.log'),
      lastMessagePath: path.join(root, 'last.md'),
    },
    {
      timeoutMs: 10_000,
      stallTimeoutMs: 1_500,
      maxAttempts: 2,
      pollIntervalMs: 50,
    },
  );

  assert.equal(result.attempts, 2);
  const markerValue = await fs.readFile(marker, 'utf8');
  assert.equal(markerValue, '2');
});

test('promptOutputsMaterialized ignores scaffold placeholders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-runtime-materialized-'));
  const prompt = path.join(root, 'prompt.md');
  const output = path.join(root, 'outputs', 'draft.md');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(prompt, `# Draft task: scene-writer\n\nWrite finished draft to: ${output}\n`, 'utf8');
  await fs.writeFile(output, '# Draft output\n', 'utf8');

  assert.equal(await promptOutputsMaterialized(prompt), false);

  await fs.writeFile(output, '###第一章\n她终于开口说了真相。\n', 'utf8');
  assert.equal(await promptOutputsMaterialized(prompt), true);
});
