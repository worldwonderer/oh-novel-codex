import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  PromptExecutionOptions,
  PromptExecutionResult,
  PromptRuntimeState,
  PromptRuntimeTargetState,
  RuntimeCompletionReason,
  RuntimeWatchTarget,
} from './types.js';

const TERMINATION_GRACE_MS = 2_000;

export async function runCodexPromptFile(options: PromptExecutionOptions): Promise<PromptExecutionResult> {
  const prompt = await fs.readFile(options.promptPath, 'utf8');
  const command = buildCodexExecCommand(options);
  const runtimeStatePath = deriveRuntimeStatePath(options.logPath);

  await fs.mkdir(path.dirname(options.logPath), { recursive: true });
  await fs.mkdir(path.dirname(options.lastMessagePath), { recursive: true });

  if (options.dryRun) {
    await materializeDryRunArtifacts(prompt, options);
    await fs.writeFile(options.logPath, `DRY RUN\n${command.join(' ')}\n`, 'utf8');
    await fs.writeFile(options.lastMessagePath, 'DRY RUN: no live Codex execution\n', 'utf8');
    const watchTargets = buildWatchTargets(prompt, options.lastMessagePath);
    const snapshots = await captureTargetSnapshots(watchTargets);
    await writeRuntimeState({
      status: 'completed',
      attempt: 0,
      maxAttempts: 0,
      command,
      logPath: options.logPath,
      lastMessagePath: options.lastMessagePath,
      runtimeStatePath,
      updatedAt: new Date().toISOString(),
      completionReason: 'dry-run',
      watchTargets: await buildPromptRuntimeTargetStates(watchTargets, snapshots),
    });
    return {
      promptPath: options.promptPath,
      logPath: options.logPath,
      lastMessagePath: options.lastMessagePath,
      dryRun: true,
      command,
      attempts: 0,
      completionReason: 'dry-run',
      runtimeStatePath,
    };
  }

  const policy = readRuntimePolicy(options);
  const watchTargets = buildWatchTargets(prompt, options.lastMessagePath);
  const { attempts, completionReason } = await runMonitoredCommand(
    command,
    prompt,
    {
      projectDir: options.projectDir,
      logPath: options.logPath,
      lastMessagePath: options.lastMessagePath,
      runtimeStatePath,
      watchTargets,
    },
    policy,
  );

  return {
    promptPath: options.promptPath,
    logPath: options.logPath,
    lastMessagePath: options.lastMessagePath,
    dryRun: false,
    command,
    attempts,
    completionReason,
    runtimeStatePath,
  };
}

function buildCodexExecCommand(options: PromptExecutionOptions): string[] {
  const codexCmd = options.codexCmd ?? 'codex';
  const args = [codexCmd, 'exec', '--skip-git-repo-check', '-C', options.projectDir];

  if (options.profile) {
    args.push('--profile', options.profile);
  }
  if (options.model) {
    args.push('--model', options.model);
  }

  const sandbox = options.sandbox ?? 'workspace-write';
  if (sandbox === 'danger-full-access') {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else {
    args.push('--full-auto');
    if (sandbox !== 'workspace-write') {
      args.push('-s', sandbox);
    }
  }

  args.push('-o', options.lastMessagePath, '-');
  return args;
}

export async function runMonitoredCommand(
  command: string[],
  stdinText: string,
  options: Pick<PromptExecutionOptions, 'projectDir' | 'logPath' | 'lastMessagePath'> & {
    runtimeStatePath?: string;
    watchTargets?: RuntimeWatchTarget[];
  },
  policy: RuntimePolicy,
): Promise<{ attempts: number; completionReason: Exclude<RuntimeCompletionReason, 'dry-run'> }> {
  let attempt = 0;
  let completionReason: Exclude<RuntimeCompletionReason, 'dry-run'> = 'process-exit';

  while (attempt < policy.maxAttempts) {
    attempt += 1;
    await fs.mkdir(path.dirname(options.logPath), { recursive: true });
    if (attempt === 1) {
      await fs.writeFile(options.logPath, '', 'utf8');
    } else {
      await fs.appendFile(options.logPath, `\n--- RETRY ${attempt} ---\n`, 'utf8');
    }
    await fs.rm(options.lastMessagePath, { force: true }).catch(() => {});
    try {
      completionReason = await runSingleAttempt(command, stdinText, options, policy, attempt);
      return { attempts: attempt, completionReason };
    } catch (error) {
      if (!(error instanceof RuntimeMonitorError) || attempt >= policy.maxAttempts) {
        throw error;
      }
      await fs.appendFile(options.logPath, `${error.kind.toUpperCase()}: ${error.message}\n`, 'utf8');
    }
  }

  return { attempts: attempt, completionReason };
}

type RuntimePolicy = {
  timeoutMs: number;
  stallTimeoutMs: number;
  maxAttempts: number;
  pollIntervalMs: number;
};

function readRuntimePolicy(options: PromptExecutionOptions): RuntimePolicy {
  return {
    timeoutMs: readPositiveInteger(options.timeoutMs, process.env.ONX_PHASE_TIMEOUT_MS, 3_600_000),
    stallTimeoutMs: readPositiveInteger(options.stallTimeoutMs, process.env.ONX_PHASE_STALL_TIMEOUT_MS, 600_000),
    maxAttempts: Math.max(1, readPositiveInteger(options.maxAttempts, process.env.ONX_PHASE_MAX_ATTEMPTS, 2)),
    pollIntervalMs: Math.max(50, readPositiveInteger(options.pollIntervalMs, process.env.ONX_PHASE_POLL_INTERVAL_MS, 2_000)),
  };
}

class RuntimeMonitorError extends Error {
  constructor(
    public kind: 'stall' | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

async function runSingleAttempt(
  command: string[],
  stdinText: string,
  options: Pick<PromptExecutionOptions, 'projectDir' | 'logPath' | 'lastMessagePath'> & {
    runtimeStatePath?: string;
    watchTargets?: RuntimeWatchTarget[];
  },
  policy: RuntimePolicy,
  attempt: number,
): Promise<Exclude<RuntimeCompletionReason, 'dry-run'>> {
  const runtimeStatePath = options.runtimeStatePath ?? deriveRuntimeStatePath(options.logPath);
  const watchTargets = options.watchTargets ?? buildWatchTargets(stdinText, options.lastMessagePath);
  const initialSnapshots = await captureTargetSnapshots(watchTargets);

  return await new Promise<Exclude<RuntimeCompletionReason, 'dry-run'>>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    const logStream = createWriteStream(options.logPath, { flags: 'a' });
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let lastStdoutAt = startedAt;
    let lastArtifactAt: number | null = null;
    let settled = false;
    let monitoring = false;
    let currentSnapshots = initialSnapshots;
    let artifactChangedSinceStart = false;
    let forcedCompletionReason: Exclude<RuntimeCompletionReason, 'dry-run'> | null = null;
    let forcedFailure: Error | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;

    const closeLogStream = (): Promise<void> =>
      new Promise((resolveClose) => {
        logStream.end(() => resolveClose());
      });

    const heartbeatStdout = () => {
      const now = Date.now();
      lastProgressAt = now;
      lastStdoutAt = now;
    };

    const requestTermination = (
      reason: string,
      outcome: { completionReason?: Exclude<RuntimeCompletionReason, 'dry-run'>; failure?: Error },
    ) => {
      if (settled) return;
      if (outcome.completionReason) {
        forcedCompletionReason = outcome.completionReason;
      }
      if (outcome.failure) {
        forcedFailure = outcome.failure;
      }
      logStream.write(`\n[monitor] ${reason}; terminating attempt ${attempt}\n`);
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, TERMINATION_GRACE_MS);
      forceKillTimer.unref?.();
    };

    const writeSnapshot = async (
      status: PromptRuntimeState['status'],
      overrides: Partial<PromptRuntimeState> = {},
    ) => {
      currentSnapshots = await captureTargetSnapshots(watchTargets).catch(() => currentSnapshots);
      await writeRuntimeState({
        status,
        attempt,
        maxAttempts: policy.maxAttempts,
        pid: child.pid,
        command,
        logPath: options.logPath,
        lastMessagePath: options.lastMessagePath,
        runtimeStatePath,
        startedAt: new Date(startedAt).toISOString(),
        updatedAt: new Date().toISOString(),
        lastProgressAt: new Date(lastProgressAt).toISOString(),
        lastStdoutAt: new Date(lastStdoutAt).toISOString(),
        lastArtifactAt: lastArtifactAt ? new Date(lastArtifactAt).toISOString() : undefined,
        timeoutMs: policy.timeoutMs,
        stallTimeoutMs: policy.stallTimeoutMs,
        watchTargets: await buildPromptRuntimeTargetStates(watchTargets, currentSnapshots, initialSnapshots),
        ...overrides,
      });
    };

    const finish = async (error: Error | null, reason: Exclude<RuntimeCompletionReason, 'dry-run'>) => {
      if (settled) return;
      settled = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      clearInterval(interval);
      if (error) {
        await writeSnapshot('failed', {
          completionReason: reason,
          error: error.message,
        });
      } else {
        await writeSnapshot('completed', {
          completionReason: reason,
        });
      }
      await closeLogStream();
      if (error) reject(error);
      else resolve(reason);
    };

    void writeSnapshot('running').catch(() => {});

    child.stdout.on('data', (chunk) => {
      heartbeatStdout();
      logStream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      heartbeatStdout();
      logStream.write(chunk);
    });
    child.on('error', (error) => {
      void finish(error, forcedCompletionReason ?? 'process-exit');
    });
    child.on('close', (code, signal) => {
      if (forcedFailure) {
        void finish(forcedFailure, forcedCompletionReason ?? 'process-exit');
        return;
      }
      if (forcedCompletionReason) {
        void finish(null, forcedCompletionReason);
        return;
      }
      if (code === 0) {
        void finish(null, 'process-exit');
        return;
      }
      void finish(
        new Error(`Codex exec failed with exit code ${code}${signal ? ` (signal ${signal})` : ''}`),
        'process-exit',
      );
    });

    const poll = async () => {
      if (settled || monitoring) return;
      monitoring = true;
      try {
        const now = Date.now();
        const nextSnapshots = await captureTargetSnapshots(watchTargets);
        const changedTargets = changedWatchTargets(watchTargets, currentSnapshots, nextSnapshots);
        if (changedTargets.length > 0) {
          currentSnapshots = nextSnapshots;
          const artifactTargets = changedTargets.filter((target) => target.kind !== 'last-message');
          if (artifactTargets.length > 0) {
            lastArtifactAt = now;
            artifactChangedSinceStart = true;
            logStream.write(
              `[monitor] artifact progress: ${artifactTargets.map((target) => path.basename(target.path)).join(', ')}\n`,
            );
          }
          lastProgressAt = now;
        } else {
          currentSnapshots = nextSnapshots;
        }

        await writeSnapshot('running');

        if (policy.timeoutMs > 0 && now - startedAt > policy.timeoutMs) {
          requestTermination(
            `timeout after ${policy.timeoutMs}ms`,
            { failure: new RuntimeMonitorError('timeout', `Command exceeded timeout (${policy.timeoutMs}ms)`) },
          );
          return;
        }

        if (policy.stallTimeoutMs <= 0 || now - lastProgressAt <= policy.stallTimeoutMs) {
          return;
        }

        const outputTargets = watchTargets.filter((target) => target.kind !== 'last-message');
        const outputsMaterialized = outputTargets.length > 0
          && outputTargets.every((target) => isMaterialized(currentSnapshots.get(target.path)));
        const outputsMeaningful = outputsMaterialized
          ? await areTargetsMeaningfullyMaterialized(outputTargets)
          : false;
        const lastMessageMaterialized = isMaterialized(currentSnapshots.get(options.lastMessagePath));

        if (outputsMeaningful && (artifactChangedSinceStart || lastMessageMaterialized)) {
          requestTermination(
            `stall after ${policy.stallTimeoutMs}ms but outputs are already materialized`,
            { completionReason: 'artifact-complete' },
          );
          return;
        }

        requestTermination(
          `stall after ${policy.stallTimeoutMs}ms without progress`,
          { failure: new RuntimeMonitorError('stall', `Command stalled (${policy.stallTimeoutMs}ms without output)` ) },
        );
      } catch (error) {
        requestTermination(
          'monitor poll failed',
          { failure: error instanceof Error ? error : new Error(String(error)) },
        );
      } finally {
        monitoring = false;
      }
    };

    const interval = setInterval(() => {
      void poll();
    }, policy.pollIntervalMs);
    interval.unref?.();

    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

async function materializeDryRunArtifacts(prompt: string, options: PromptExecutionOptions): Promise<void> {
  const targets = extractOutputTargets(prompt);
  for (const target of targets) {
    await fs.mkdir(path.dirname(target.path), { recursive: true });
    if (target.kind === 'review-card') {
      const reviewer = target.reviewer ?? path.basename(target.path, '.md');
      const card = `---
reviewer: ${reviewer}
verdict: pass
priority: P2
confidence: low
ship: ship
---

# Review card

## Strongest evidence
- dry-run placeholder card

## Top issues
- [P2] review not executed live; confirm manually before shipping

## Sections to patch
- none

## Ship recommendation
- ship
`;
      await fs.writeFile(target.path, card, 'utf8');
      continue;
    }

    if (target.kind === 'draft') {
      await fs.writeFile(target.path, buildDryRunDraftContent(path.basename(options.promptPath)), 'utf8');
      continue;
    }

    await fs.writeFile(target.path, `# DRY RUN OUTPUT\n\nGenerated from ${path.basename(options.promptPath)}\n`, 'utf8');
  }
}

export function deriveRuntimeStatePath(logPath: string): string {
  const ext = path.extname(logPath);
  return ext
    ? logPath.slice(0, -ext.length) + '.runtime.json'
    : `${logPath}.runtime.json`;
}

export function extractOutputTargets(prompt: string): RuntimeWatchTarget[] {
  const targets: RuntimeWatchTarget[] = [];
  const lines = prompt.split('\n');
  let reviewer: string | undefined;

  for (const line of lines) {
    const reviewMatch = line.match(/^# Review task:\s*(.+)$/);
    if (reviewMatch) {
      reviewer = reviewMatch[1].trim();
      continue;
    }

    const outputCardMatch = line.match(/^Output card:\s*(.+)$/);
    if (outputCardMatch) {
      targets.push({ kind: 'review-card', path: outputCardMatch[1].trim(), reviewer });
      continue;
    }

    const outputMatch = line.match(/^Write (?:architecture|outline|finished draft|handoff note) to:\s*(.+)$/);
    if (outputMatch) {
      const isDraft = /^Write finished draft to:/i.test(line);
      targets.push({ kind: isDraft ? 'draft' : 'markdown', path: outputMatch[1].trim() });
    }
  }

  return targets;
}

export async function promptOutputsMaterialized(promptPath: string): Promise<boolean> {
  try {
    const prompt = await fs.readFile(promptPath, 'utf8');
    const targets = extractOutputTargets(prompt).filter((target) => target.kind !== 'last-message');
    if (targets.length === 0) return false;
    const snapshots = await captureTargetSnapshots(targets);
    for (const target of targets) {
      if (!isMaterialized(snapshots.get(target.path))) return false;
      if (!(await hasMeaningfulTargetContent(target.path))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function buildDryRunDraftContent(promptName: string): string {
  const block = '　　她站在风里，没有回头，只把已经熄灭的旧日一点点收拢起来，重新安放进自己往后的日子里。\n';
  return `###第一章\n\n${block.repeat(60)}\n###第二章\n\n${block.repeat(60)}\n###第三章\n\n${block.repeat(60)}\n###第四章\n\n${block.repeat(60)}\n# DRY RUN OUTPUT\n\nGenerated from ${promptName}\n`;
}

function buildWatchTargets(prompt: string, lastMessagePath: string): RuntimeWatchTarget[] {
  const targets = extractOutputTargets(prompt);
  const deduped = new Map<string, RuntimeWatchTarget>();
  for (const target of targets) {
    deduped.set(target.path, target);
  }
  deduped.set(lastMessagePath, { kind: 'last-message', path: lastMessagePath });
  return [...deduped.values()];
}

type FileSnapshot = {
  exists: boolean;
  size: number;
  mtimeMs: number;
};

async function captureTargetSnapshots(targets: RuntimeWatchTarget[]): Promise<Map<string, FileSnapshot>> {
  const snapshots = new Map<string, FileSnapshot>();
  await Promise.all(targets.map(async (target) => {
    try {
      const stat = await fs.stat(target.path);
      snapshots.set(target.path, {
        exists: stat.isFile(),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      snapshots.set(target.path, {
        exists: false,
        size: 0,
        mtimeMs: 0,
      });
    }
  }));
  return snapshots;
}

function changedWatchTargets(
  targets: RuntimeWatchTarget[],
  previous: Map<string, FileSnapshot>,
  next: Map<string, FileSnapshot>,
): RuntimeWatchTarget[] {
  return targets.filter((target) => {
    const before = previous.get(target.path) ?? { exists: false, size: 0, mtimeMs: 0 };
    const after = next.get(target.path) ?? { exists: false, size: 0, mtimeMs: 0 };
    return before.exists !== after.exists || before.size !== after.size || before.mtimeMs !== after.mtimeMs;
  });
}

function isMaterialized(snapshot: FileSnapshot | undefined): boolean {
  return Boolean(snapshot?.exists && snapshot.size > 0);
}

const PLACEHOLDER_FIRST_LINES = new Set([
  '# Architecture output',
  '# Outline output',
  '# Draft output',
  '# Revision plan output',
  '# Revised draft output',
]);

async function hasMeaningfulTargetContent(targetPath: string): Promise<boolean> {
  try {
    const content = (await fs.readFile(targetPath, 'utf8')).trim();
    if (!content) return false;
    const [firstLine] = content.split(/\r?\n/, 1);
    return !PLACEHOLDER_FIRST_LINES.has(firstLine.trim());
  } catch {
    return false;
  }
}

async function areTargetsMeaningfullyMaterialized(targets: RuntimeWatchTarget[]): Promise<boolean> {
  const checks = await Promise.all(targets.map(async (target) => hasMeaningfulTargetContent(target.path)));
  return checks.every(Boolean);
}

async function buildPromptRuntimeTargetStates(
  targets: RuntimeWatchTarget[],
  current: Map<string, FileSnapshot>,
  baseline: Map<string, FileSnapshot> = current,
): Promise<PromptRuntimeTargetState[]> {
  return targets.map((target) => {
    const snapshot = current.get(target.path) ?? { exists: false, size: 0, mtimeMs: 0 };
    const initial = baseline.get(target.path) ?? { exists: false, size: 0, mtimeMs: 0 };
    return {
      ...target,
      exists: snapshot.exists,
      size: snapshot.size,
      mtime: snapshot.mtimeMs > 0 ? new Date(snapshot.mtimeMs).toISOString() : undefined,
      changed:
        snapshot.exists !== initial.exists
        || snapshot.size !== initial.size
        || snapshot.mtimeMs !== initial.mtimeMs,
    };
  });
}

async function writeRuntimeState(state: PromptRuntimeState): Promise<void> {
  await fs.mkdir(path.dirname(state.runtimeStatePath), { recursive: true });
  await fs.writeFile(state.runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function readPositiveInteger(
  explicit: number | undefined,
  envValue: string | undefined,
  fallback: number,
): number {
  if (Number.isFinite(explicit) && (explicit as number) > 0) {
    return Math.trunc(explicit as number);
  }
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }
  return fallback;
}
