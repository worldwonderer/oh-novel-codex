import fs from 'node:fs/promises';
import { execFile as defaultExecFile } from 'node:child_process';
import path from 'node:path';

export type TmuxNudgeResult = {
  nudged: boolean;
  reason: string;
};

export type TmuxPaneInspection = {
  dead: boolean;
  inMode: boolean;
  currentCommand: string;
  width: number;
  height: number;
  capture: string;
  looksReady: boolean;
  bootstrapping: boolean;
};

export type TmuxPaneHealth = {
  pane: string;
  ok: boolean;
  reason:
    | 'ok'
    | 'pane_dead'
    | 'pane_in_copy_mode'
    | 'pane_bootstrapping'
    | 'pane_too_narrow'
    | 'pane_too_short'
    | 'pane_running_shell_not_ready'
    | 'pane_running_agent_not_ready';
  width: number;
  height: number;
  currentCommand: string;
  dead: boolean;
  inMode: boolean;
  looksReady: boolean;
  bootstrapping: boolean;
};

export type TmuxLayoutGuardResult = {
  applied: boolean;
  reason: 'already_healthy' | 'resized' | 'failed_to_improve';
  before: TmuxPaneHealth;
  after: TmuxPaneHealth;
};

export async function nudgeTmuxPane(
  projectDir: string,
  input: {
    pane: string;
    key: string;
    message: string;
    cooldownMs?: number;
    tmuxBin?: string;
  },
  deps: {
    execFile?: typeof defaultExecFile;
  } = {},
): Promise<TmuxNudgeResult> {
  const cooldownMs = Math.max(0, input.cooldownMs ?? Number(process.env.ONX_TMUX_NUDGE_COOLDOWN_MS ?? 30_000));
  const maxCount = Math.max(1, Number(process.env.ONX_TMUX_NUDGE_MAX_COUNT ?? 3));
  const windowMs = Math.max(cooldownMs, Number(process.env.ONX_TMUX_NUDGE_WINDOW_MS ?? 10 * 60_000));
  const state = await readTmuxNudgeState(projectDir);
  const previous = state[input.key];
  const previousAtMs = previous?.at ? Date.parse(previous.at) : Number.NaN;
  if (Number.isFinite(previousAtMs) && Date.now() - previousAtMs > windowMs) {
    delete state[input.key];
  }
  const current = state[input.key];
  const currentAtMs = current?.at ? Date.parse(current.at) : Number.NaN;
  if ((current?.count ?? 0) >= maxCount) {
    return { nudged: false, reason: 'max_nudges_exhausted' };
  }
  if (Number.isFinite(currentAtMs) && Date.now() - currentAtMs < cooldownMs) {
    return { nudged: false, reason: 'cooldown_active' };
  }

  const execFile = deps.execFile ?? defaultExecFile;
  const tmuxBin = input.tmuxBin ?? process.env.ONX_TMUX_BIN ?? 'tmux';
  const health = await readTmuxPaneHealth(input.pane, tmuxBin, execFile);
  if (!health.ok) {
    return { nudged: false, reason: health.reason };
  }
  await execFilePromise(execFile, tmuxBin, ['send-keys', '-t', input.pane, input.message, 'C-m']);

  state[input.key] = {
    at: new Date().toISOString(),
    pane: input.pane,
    message: input.message,
    count: (current?.count ?? 0) + 1,
    lastReason: 'sent',
  };
  await writeTmuxNudgeState(projectDir, state);
  return { nudged: true, reason: 'sent' };
}

const SHELL_COMMANDS = new Set(['zsh', 'bash', 'fish', 'sh', 'dash', 'ksh', 'csh', 'tcsh', 'login']);
const PROMPT_REQUIRED_COMMANDS = new Set([
  ...SHELL_COMMANDS,
  'claude',
  'codex',
  'gemini',
  'node',
]);

type ExecFileFn = typeof defaultExecFile;

export async function inspectTmuxPane(
  pane: string,
  tmuxBin = process.env.ONX_TMUX_BIN ?? 'tmux',
  execFile: ExecFileFn = defaultExecFile,
): Promise<TmuxPaneInspection> {
  const meta = await execFilePromise(execFile, tmuxBin, ['display-message', '-p', '-t', pane, '#{pane_dead}\t#{pane_in_mode}\t#{pane_current_command}\t#{pane_width}\t#{pane_height}']);
  const [deadRaw = '0', inModeRaw = '0', currentCommand = '', widthRaw = '0', heightRaw = '0'] = meta.trimEnd().split('\t');
  const capture = await execFilePromise(execFile, tmuxBin, ['capture-pane', '-p', '-t', pane, '-S', '-80']);
  const looksReady = paneLooksReady(capture);
  const bootstrapping = paneIsBootstrapping(capture);
  return {
    dead: deadRaw === '1',
    inMode: inModeRaw === '1',
    currentCommand: currentCommand.trim(),
    width: Number(widthRaw) || 0,
    height: Number(heightRaw) || 0,
    capture,
    looksReady,
    bootstrapping,
  };
}

export async function readTmuxPaneHealth(
  pane: string,
  tmuxBin = process.env.ONX_TMUX_BIN ?? 'tmux',
  execFile: ExecFileFn = defaultExecFile,
): Promise<TmuxPaneHealth> {
  const inspection = await inspectTmuxPane(pane, tmuxBin, execFile);
  const minWidth = Math.max(1, Number(process.env.ONX_TMUX_MIN_WIDTH ?? 20) || 20);
  const minHeight = Math.max(1, Number(process.env.ONX_TMUX_MIN_HEIGHT ?? 8) || 8);
  const normalizedCommand = normalizePaneCommand(inspection.currentCommand);

  let reason: TmuxPaneHealth['reason'] = 'ok';
  if (inspection.dead) reason = 'pane_dead';
  else if (inspection.inMode) reason = 'pane_in_copy_mode';
  else if (inspection.bootstrapping) reason = 'pane_bootstrapping';
  else if (inspection.width > 0 && inspection.width < minWidth) reason = 'pane_too_narrow';
  else if (inspection.height > 0 && inspection.height < minHeight) reason = 'pane_too_short';
  else if (normalizedCommand && PROMPT_REQUIRED_COMMANDS.has(normalizedCommand) && !inspection.looksReady) {
    reason = SHELL_COMMANDS.has(normalizedCommand) ? 'pane_running_shell_not_ready' : 'pane_running_agent_not_ready';
  }

  return {
    pane,
    ok: reason === 'ok',
    reason,
    width: inspection.width,
    height: inspection.height,
    currentCommand: inspection.currentCommand,
    dead: inspection.dead,
    inMode: inspection.inMode,
    looksReady: inspection.looksReady,
    bootstrapping: inspection.bootstrapping,
  };
}

export async function applyTmuxLayoutGuard(
  pane: string,
  options: {
    minWidth?: number;
    minHeight?: number;
    targetWidth?: number;
    targetHeight?: number;
    layout?: string;
    tmuxBin?: string;
  } = {},
  deps: {
    execFile?: typeof defaultExecFile;
  } = {},
): Promise<TmuxLayoutGuardResult> {
  const execFile = deps.execFile ?? defaultExecFile;
  const tmuxBin = options.tmuxBin ?? process.env.ONX_TMUX_BIN ?? 'tmux';
  const before = await readTmuxPaneHealth(pane, tmuxBin, execFile);
  if (before.ok) {
    return {
      applied: false,
      reason: 'already_healthy',
      before,
      after: before,
    };
  }

  const minWidth = Math.max(1, options.minWidth ?? (Number(process.env.ONX_TMUX_MIN_WIDTH ?? 20) || 20));
  const minHeight = Math.max(1, options.minHeight ?? (Number(process.env.ONX_TMUX_MIN_HEIGHT ?? 8) || 8));
  const targetWidth = Math.max(minWidth, options.targetWidth ?? (Number(process.env.ONX_TMUX_TARGET_WIDTH ?? 160) || 160));
  const targetHeight = Math.max(minHeight, options.targetHeight ?? (Number(process.env.ONX_TMUX_TARGET_HEIGHT ?? 40) || 40));
  const layout = options.layout ?? process.env.ONX_TMUX_TARGET_LAYOUT ?? 'tiled';

  try {
    await execFilePromise(execFile, tmuxBin, ['resize-window', '-t', pane, '-x', String(targetWidth), '-y', String(targetHeight)]);
  } catch {
    // best effort
  }
  try {
    await execFilePromise(execFile, tmuxBin, ['select-layout', '-t', pane, layout]);
  } catch {
    // best effort
  }

  const after = await readTmuxPaneHealth(pane, tmuxBin, execFile);
  return {
    applied: before.reason !== after.reason || before.width !== after.width || before.height !== after.height,
    reason: after.ok ? 'resized' : 'failed_to_improve',
    before,
    after,
  };
}

export function paneLooksReady(capture: string): boolean {
  const content = String(capture ?? '').trimEnd();
  if (content === '') return false;

  const lines = normalizePaneLines(content);
  if (paneIsBootstrapping(lines)) return false;

  const lastLine = lines.at(-1) ?? '';
  if (/^\s*[›>❯]\s*/u.test(lastLine)) return true;
  if (/(?:[$%#>] ?|❯ ?)$/.test(lastLine)) return true;

  const hasCodexPromptLine = lines.some((line) => /^\s*›\s*/u.test(line));
  const hasClaudePromptLine = lines.some((line) => /^\s*❯\s*/u.test(line));
  if (hasCodexPromptLine || hasClaudePromptLine) return true;

  if (lines.some((line) => /\bhow can i help(?: you)?\b/i.test(line))) return true;

  return lines.some((line) => /^\s*(?:[›>❯]\s*)?[A-Z][A-Z0-9]+-\d+\s+only(?:\s*(?:…|\.{3}))?\s*$/iu.test(line));
}

function normalizePaneCommand(command: string): string {
  return path.basename(command.trim()).toLowerCase().replace(/^-/, '');
}

function normalizePaneLines(capturedOrLines: string | string[]): string[] {
  if (Array.isArray(capturedOrLines)) {
    return capturedOrLines
      .map((line) => stripAnsi(String(line ?? '')).replace(/\r/g, '').trimEnd())
      .filter((line) => line.trim() !== '');
  }

  return String(capturedOrLines ?? '')
    .split('\n')
    .map((line) => stripAnsi(line).replace(/\r/g, '').trimEnd())
    .filter((line) => line.trim() !== '');
}

function paneIsBootstrapping(capturedOrLines: string | string[]): boolean {
  const lines = normalizePaneLines(capturedOrLines);
  return lines.some((line) =>
    /\b(loading|initializing|starting up)\b/i.test(line)
    || /\bmodel:\s*loading\b/i.test(line)
    || /\bconnecting\s+to\b/i.test(line)
  );
}

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, '');
}

type TmuxNudgeState = Record<string, { at: string; pane: string; message: string; count?: number; lastReason?: string }>;

function tmuxNudgeStatePath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'state', 'tmux-nudge-state.json');
}

async function readTmuxNudgeState(projectDir: string): Promise<TmuxNudgeState> {
  try {
    const raw = await fs.readFile(tmuxNudgeStatePath(projectDir), 'utf8');
    return JSON.parse(raw) as TmuxNudgeState;
  } catch {
    return {};
  }
}

async function writeTmuxNudgeState(projectDir: string, state: TmuxNudgeState): Promise<void> {
  const target = tmuxNudgeStatePath(projectDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function execFilePromise(execFile: ExecFileFn, file: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    execFile(file, args, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout ?? '');
    });
  });
}
