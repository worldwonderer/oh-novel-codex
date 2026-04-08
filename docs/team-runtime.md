# Team runtime

ONX team runtime is a lightweight lane coordinator around review jobs. It is **state-driven**, not a persistent leader/worker mailbox fabric.

## Purpose

Use it when:
- a review job already exists
- you want reviewer lanes to run in parallel or serial order
- you want lane-level runtime state and resumability
- you want watchdog / fallback recovery to understand the active lane

Prefer external OMX orchestration only when you need long-lived tmux workers, leader/worker mailboxes, or per-worker status files.

## Commands

Create a team job from a review job:

```bash
onx team-start --review-job .onx/reviews/jobs/<review-job> --project .
```

Create it from a workflow job:

```bash
onx team-start --workflow-job .onx/workflows/jobs/<workflow-job> --project .
```

Run the team:

```bash
onx team-run --latest --project . --parallel --dry-run
```

Run a specific lane range:

```bash
onx team-run --job .onx/team/jobs/<team-job> --from hook-doctor --to character-doctor
```

Bind the active tmux pane so watchdog nudges can target the real Codex pane:

```bash
onx team-run --job .onx/team/jobs/<team-job> --tmux-pane %12
```

Preflight the pane/window if needed:

```bash
onx tmux-guard --pane %12 --json
onx tmux-guard --pane %12 --apply --target-width 180 --target-height 50
```

Inspect state:

```bash
onx team-status --latest --project .
```

Recover stalled tmux-bound lanes:

```bash
onx watchdog --project . --nudge-stalled
onx watchdog --project . --nudge-stalled --resume-stalled
onx fallback-watcher --project . --follow-events --nudge-stalled
```

## What it does

- creates a team job under `.onx/team/jobs/`
- mirrors review lanes into team lane runtime state
- runs lanes in parallel or serial mode
- writes reviewer cards into the linked review job
- aggregates the final review verdict after every lane completes
- keeps `.onx/state/modes/team.json` aligned with the current lane for status / watchdog use

## Tmux pane readiness and auto-nudge

When `team-run` receives `--tmux-pane`, `ONX_TMUX_PANE`, or an in-session `TMUX_PANE`, it stores that pane reference in team mode metadata. The watchdog can then choose a **nudge-before-restart** path for stalled lanes.

Operationally:

- `onx watchdog --nudge-stalled` is now enough to enter the recovery path; it does not require `--resume`, `--resume-stalled`, or `--resume-untracked` just to attempt a nudge.
- `onx fallback-watcher --nudge-stalled` likewise treats stalled-job nudging as an active recovery mode.
- if you want ONX to restart a stalled lane when a nudge is blocked, skipped, or exhausted, add `--resume-stalled`.

Current nudge safeguards:

- skip dead panes
- skip panes in copy-mode
- skip panes that are too narrow / too short for reliable interaction
- skip shells that do not look prompt-ready yet
- enforce cooldown / max-count limits via:
  - `ONX_TMUX_NUDGE_COOLDOWN_MS`
  - `ONX_TMUX_NUDGE_MAX_COUNT`
  - `ONX_TMUX_NUDGE_WINDOW_MS`
  - `ONX_TMUX_MIN_WIDTH`
  - `ONX_TMUX_MIN_HEIGHT`

Relevant events:

- `runtime.watchdog.nudged` — emitted only when a nudge was actually sent
- `runtime.watchdog.recovered`
- `team.lane.started`
- `team.lane.completed`
- `team.lane.failed`

## State surfaces

The main files involved in team execution are:

- `.onx/team/jobs/<job>/manifest.json` — links the team job back to its review job
- `.onx/team/jobs/<job>/runtime/state.json` — lane-by-lane execution state
- `.onx/state/modes/team.json` — current active team mode, including `tmuxPane` / `tmuxSession` metadata when present
- `.onx/logs/events.jsonl` — event trace for team lane starts, completions, failures, nudges, and recoveries

## Coordination model and current limitation

ONX team runtime coordinates **lanes**, not named tmux workers. Today it does **not** maintain:

- leader mailboxes
- worker inbox files
- per-worker status registries
- mailbox delivery / acknowledgement state

That is an intentional scope boundary: ONX team jobs stay lightweight and review-lane-focused. If you need mailbox state from an external OMX runtime under `.omx/state/team/...`, treat it as interop data rather than ONX’s native coordination model.
