import { applyTmuxLayoutGuard, readTmuxPaneHealth } from '../runtime/tmux.js';

export async function tmuxGuard(args: string[]): Promise<void> {
  const pane = readFlagValue(args, '--pane') ?? process.env.ONX_TMUX_PANE ?? process.env.TMUX_PANE;
  if (!pane) {
    throw new Error('tmux-guard requires --pane <id> or TMUX_PANE');
  }

  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const minWidth = readNumberFlag(args, '--min-width');
  const minHeight = readNumberFlag(args, '--min-height');
  const targetWidth = readNumberFlag(args, '--target-width');
  const targetHeight = readNumberFlag(args, '--target-height');
  const layout = readFlagValue(args, '--layout');

  if (apply) {
    const result = await applyTmuxLayoutGuard(pane, {
      minWidth,
      minHeight,
      targetWidth,
      targetHeight,
      layout,
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    process.stdout.write(
      `# ONX Tmux Guard\n\n- Pane: ${pane}\n- Result: ${result.reason}\n- Before: ${result.before.reason} ${result.before.width}x${result.before.height}\n- After: ${result.after.reason} ${result.after.width}x${result.after.height}\n`,
    );
    return;
  }

  const health = await readTmuxPaneHealth(pane);
  if (json) {
    process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `# ONX Tmux Guard\n\n- Pane: ${pane}\n- Health: ${health.reason}\n- Size: ${health.width}x${health.height}\n- Command: ${health.currentCommand}\n- Ready: ${health.looksReady ? 'yes' : 'no'}\n`,
  );
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function readNumberFlag(args: string[], flag: string): number | undefined {
  const raw = readFlagValue(args, flag);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
