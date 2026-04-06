# Hooks and notifications

ONX can emit runtime events for:

- draft job creation
- review job creation
- workflow job creation
- team job creation
- review/workflow phase start
- review/workflow phase complete
- review/workflow phase fail
- team lane start
- team lane complete
- team lane fail
- watchdog nudges
- watchdog recoveries

## Event log

All events are appended to:

```text
.onx/logs/events.jsonl
```

Each line is one JSON object.

## Optional external hook

Set:

```bash
export ONX_NOTIFY_HOOK='cat > /tmp/onx-last-event.json'
```

When configured, ONX will pipe each event JSON object to that shell command on stdin.

## Built-in notify-hook bridge

You can also route ONX events back into ONX itself:

```bash
export ONX_NOTIFY_HOOK='node dist/cli/onx.js notify-hook --project . --auto-watch --resume --resume-stalled --resume-untracked'
```

This will:

- persist the latest hook payload to `.onx/state/notify-hook-state.json`
- optionally trigger one fallback watcher tick
- allow hook-driven recovery instead of relying only on manual watchdog runs

When `--nudge-stalled` is enabled and the active mode state includes `tmuxPane`, the hook/fallback path can emit `runtime.watchdog.nudged` before escalating to a restart-oriented recovery path. That event is emitted only when the nudge is actually sent; if the pane is not ready, is in copy-mode, is dead, or the cooldown/max window blocks the send, you will not see a nudge event unless you also pair the run with `--resume-stalled` and reach the recovery branch.

To also ensure a background fallback watcher is present:

```bash
export ONX_NOTIFY_HOOK='node dist/cli/onx.js notify-hook --project . --ensure-watcher --auto-watch --nudge-stalled --resume --resume-stalled --resume-untracked'
```

## Intended use

- status dashboards
- local notifications
- external automation
- debugging long-running workflow execution
- hook-driven fallback recovery
