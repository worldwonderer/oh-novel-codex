import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { watchdog } from '../watchdog.js';
import { hud } from '../hud.js';
import { mcpConfig } from '../mcp-config.js';
import { status } from '../status.js';
import { uninstall } from '../uninstall.js';
import { installAssets } from '../../config/generator.js';
import { deriveRuntimeStatePath } from '../../runtime/codex.js';
import { updateModeState } from '../../state/mode-state.js';

test('mcp-config writes config file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-mcpcfg-'));
  const output = path.join(root, 'mcp.json');
  await mcpConfig(['--surface', 'trace', '--node', '/usr/bin/node', '--onx', '/tmp/onx.js', '--output', output]);
  const data = JSON.parse(await fs.readFile(output, 'utf8')) as { mcpServers: Record<string, { args: string[] }> };
  assert.deepEqual(data.mcpServers['onx-trace'].args, ['/tmp/onx.js', 'mcp-server', 'trace']);
});

test('uninstall removes installed prompts and skills', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-uninstall-home-'));
  await installAssets({ codexHome });
  await uninstall(['--codex-home', codexHome]);
  const promptEntries = await fs.readdir(path.join(codexHome, 'prompts')).catch(() => []);
  const skillEntries = await fs.readdir(path.join(codexHome, 'skills')).catch(() => []);
  assert.equal(promptEntries.length, 0);
  assert.equal(skillEntries.length, 0);
});

test('status and hud surface watchdog problems', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-status-watchdog-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
  });

  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date(Date.now() - 300_000).toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );

  const statusJson = await captureStdout(() => status(['--project', root, '--json']));
  const parsedStatus = JSON.parse(statusJson) as { watchdog: Array<{ problem: string }> };
  assert.equal(parsedStatus.watchdog[0].problem, 'untracked');

  const hudJson = await captureStdout(() => hud(['--project', root, '--json']));
  const parsedHud = JSON.parse(hudJson) as { watchdog: Array<{ problem: string }> };
  assert.equal(parsedHud.watchdog[0].problem, 'untracked');
});

test('status and hud surface external team interop summaries', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-status-omx-team-'));
  const teamRoot = path.join(root, '.omx', 'state', 'team', 'demo-team');
  await fs.mkdir(path.join(teamRoot, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(teamRoot, 'mailbox'), { recursive: true });
  await fs.mkdir(path.join(teamRoot, 'workers', 'worker-1'), { recursive: true });
  await fs.writeFile(path.join(teamRoot, 'config.json'), JSON.stringify({ name: 'demo-team', workers: [{ name: 'worker-1' }] }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'tasks', 'task-1.json'), JSON.stringify({ status: 'pending' }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'mailbox', 'leader-fixed.json'), JSON.stringify({ messages: [{ from_worker: 'worker-1', body: 'x' }] }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'workers', 'worker-1', 'status.json'), JSON.stringify({ state: 'working' }, null, 2));
  await fs.writeFile(path.join(teamRoot, 'monitor-snapshot.json'), JSON.stringify({ workerAliveByName: { 'worker-1': false } }, null, 2));

  const statusJson = await captureStdout(() => status(['--project', root, '--json']));
  const parsedStatus = JSON.parse(statusJson) as {
    externalTeams: Array<{ runtimeKind: string; teamName: string; leaderMailbox: { total: number; latestFrom?: string }; attentionPending: boolean; deadWorkers: number }>;
  };
  assert.equal(parsedStatus.externalTeams[0].runtimeKind, 'omx');
  assert.equal(parsedStatus.externalTeams[0].teamName, 'demo-team');
  assert.equal(parsedStatus.externalTeams[0].leaderMailbox.total, 1);
  assert.equal(parsedStatus.externalTeams[0].leaderMailbox.latestFrom, 'worker-1');
  assert.equal(parsedStatus.externalTeams[0].attentionPending, true);
  assert.equal(parsedStatus.externalTeams[0].deadWorkers, 1);

  const hudJson = await captureStdout(() => hud(['--project', root, '--json']));
  const parsedHud = JSON.parse(hudJson) as { externalTeams: Array<{ runtimeKind: string; teamName: string; attentionPending: boolean }> };
  assert.equal(parsedHud.externalTeams[0].runtimeKind, 'omx');
  assert.equal(parsedHud.externalTeams[0].teamName, 'demo-team');
  assert.equal(parsedHud.externalTeams[0].attentionPending, true);
});

test('watchdog --nudge-stalled routes through recovery even without resume flags', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-watchdog-cli-nudge-'));
  const jobDir = path.join(root, '.onx', 'workflows', 'jobs', 'job-1');
  const logPath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.log');
  const lastMessagePath = path.join(jobDir, 'runtime', 'logs', 'hook-doctor.last.md');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await updateModeState(root, 'workflow', {
    active: true,
    status: 'running',
    jobDir,
    currentPhase: 'review:hook-doctor',
    metadata: {
      tmuxPane: '%9',
    },
  });
  await fs.writeFile(
    path.join(jobDir, 'runtime', 'state.json'),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [
        {
          name: 'review:hook-doctor',
          kind: 'review',
          logPath,
          lastMessagePath,
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      ],
    }, null, 2),
    'utf8',
  );
  await fs.writeFile(
    deriveRuntimeStatePath(logPath),
    JSON.stringify({
      status: 'running',
      attempt: 1,
      maxAttempts: 2,
      pid: process.pid,
      command: ['codex', 'exec'],
      logPath,
      lastMessagePath,
      runtimeStatePath: deriveRuntimeStatePath(logPath),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(Date.now() - 180_000).toISOString(),
      stallTimeoutMs: 1000,
      watchTargets: [],
    }, null, 2),
    'utf8',
  );

  const watchdogJson = await captureStdout(() => watchdog([
    '--project', root,
    '--json',
    '--dry-run',
    '--nudge-stalled',
    '--stalled-grace-ms', '0',
  ]));
  const parsed = JSON.parse(watchdogJson) as Array<{ problem: string }>;
  assert.equal(parsed[0]?.problem, 'stalled');

  const eventsLog = await fs.readFile(path.join(root, '.onx', 'logs', 'events.jsonl'), 'utf8');
  assert.match(eventsLog, /runtime\.watchdog\.nudged/);
});

test('notify-hook writes hook state and can trigger auto-watch tick', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-notify-hook-'));
  const event = {
    timestamp: new Date().toISOString(),
    kind: 'workflow.phase.failed',
    projectDir: root,
    mode: 'workflow',
    jobDir: path.join(root, '.onx', 'workflows', 'jobs', 'job-1'),
    phase: 'review:hook-doctor',
  };

  const child = spawn(process.execPath, ['dist/cli/onx.js', 'notify-hook', '--project', root, '--auto-watch', '--resume-untracked', '--dry-run'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'ignore', 'pipe'],
    env: process.env,
  });

  child.stdin.write(JSON.stringify(event));
  child.stdin.end();
  await new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`notify-hook exited with ${code}`));
    });
  });

  const state = JSON.parse(
    await fs.readFile(path.join(root, '.onx', 'state', 'notify-hook-state.json'), 'utf8'),
  ) as { lastEvent: { kind: string }; autoWatch: { enabled: boolean } };
  assert.equal(state.lastEvent.kind, 'workflow.phase.failed');
  assert.equal(state.autoWatch.enabled, true);
});

test('notify-hook can ensure a fallback watcher process path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-notify-hook-ensure-'));
  const event = {
    timestamp: new Date().toISOString(),
    kind: 'workflow.phase.completed',
    projectDir: root,
    mode: 'workflow',
  };

  const child = spawn(process.execPath, ['dist/cli/onx.js', 'notify-hook', '--project', root, '--ensure-watcher', '--watcher-once', '--watcher-dry-run'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'ignore', 'pipe'],
    env: process.env,
  });

  child.stdin.write(JSON.stringify(event));
  child.stdin.end();
  await new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`notify-hook exited with ${code}`));
    });
  });

  const hookState = JSON.parse(
    await fs.readFile(path.join(root, '.onx', 'state', 'notify-hook-state.json'), 'utf8'),
  ) as { ensuredWatcher: { enabled: boolean; spawned: boolean } };
  assert.equal(hookState.ensuredWatcher.enabled, true);

  await waitForFile(path.join(root, '.onx', 'state', 'fallback-watcher.json'), 5000);
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

async function waitForFile(target: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(target);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}
