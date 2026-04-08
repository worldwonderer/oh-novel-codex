# oh-novel-codex (ONX)

A novel-first workflow layer for Codex CLI.

ONX mirrors the spirit of `oh-my-codex`, but narrows the runtime around long-form fiction, web-novel drafting, Zhihu-style rewrites, ending punch-ups, character-depth passes, and publish-readiness review.

## What ONX adds around Codex

- novel-specific **agent prompts** for architecture, scenes, endings, and ship-gate review
- reusable **workflow skills** for intake, planning, drafting, rewriting, and polishing
- a novel-oriented `AGENTS.md` orchestration brain
- `.onx/` project state folders for plans, drafts, reviews, notes, and logs
- story-memory collections for characters, world rules, relationships, timeline, voice, and continuity
- a small CLI (`onx`) for setup, doctor, version, and project bootstrap
- runtime event logging plus optional external notify hook support
- fiction quality scorecards plus publish-readiness routing inside review/workflow aggregation
- a generated prompt / skill catalog (`docs/skills.md`, `docs/prompts.md`, `docs/catalog.json`) so packaged assets stay in sync

Codex remains the execution engine. ONX gives it a cleaner fiction workflow.

## Recommended flow

```text
$novel-interview "clarify the target genre, audience, and ending feel"
$story-architect "turn the brief into a conflict ladder and chapter plan"
$draft-longform "write the complete 8k–12k first-person Zhihu-style draft"
$review-pipeline "run the multi-agent fiction review pass"
$publish-check "run the final publish-readiness gate"
```

For rewrite-heavy work:

```text
$zhihu-remix "structurally remix this source story into a low-similarity 8k–12k finished draft"
```

For continuing projects:

```bash
onx story-write --collection characters --key heroine --text "# Heroine"
onx story-write --collection voice --key default --text "# Default voice"
onx continuity-report --project .
```

## Practical demo

Want a concrete, end-to-end example? Start with the
[Zhihu remix automation showcase](./docs/showcase-zhihu-remix-automation.md)
or the [story memory + quality gate showcase](./docs/showcase-story-memory-quality-gate.md).

## Quick start

### Requirements

- Node.js 20+
- Codex CLI installed and authenticated

### Install and bootstrap

```bash
npm install
npm run build
node dist/cli/onx.js setup --project .
```

This installs ONX prompts into your Codex home, installs ONX skills into your Codex skills directory, and scaffolds a project-local `AGENTS.md` plus `.onx/` state folders.

If you change the prompt / skill inventory, regenerate the checked-in catalog artifacts:

```bash
node dist/scripts/generate-catalog-docs.js
```

Optional release-style smoke check:

```bash
npm run smoke:packed-install
```

That smoke test now verifies both boot commands and a minimal installed `setup -> doctor --json -> run-draft -> run-review -> run-workflow --execute --dry-run` chain in an isolated temporary prefix.

Generated references:

<!-- ONX:DOCS:START -->
- [docs index](./docs/index.md)
- [CLI reference](./docs/cli.md)
- [Skills catalog](./docs/skills.md)
- [Prompts catalog](./docs/prompts.md)
- [Catalog JSON contract](./docs/catalog.json)
- [Story memory & continuity](./docs/story-memory.md)
- [Quality engine](./docs/quality-engine.md)
<!-- ONX:DOCS:END -->

## Commands

The complete command reference is generated from the CLI help source:

- [CLI reference](./docs/cli.md)

<!-- ONX:CLI:START -->
| Common command | Why you run it |
| --- | --- |
| `onx setup [--project <dir>] [--codex-home <dir>] [--force]` | Install prompts/skills and scaffold a novel project. |
| `onx doctor [--codex-home <dir>] [--project <dir>] [--json]` | Validate global assets plus local ONX scaffold health. |
| `onx run-draft --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>]` | Create a draft job with architecture, outline, and writing prompts. |
| `onx run-workflow --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>] [--execute] [--dry-run]` | Create the full draft + review workflow job chain. |
| `onx run-review --draft <file> [--source <file>] [--project <dir>] [--job-name <name>] [--reviewers a,b,c]` | Create a review job with reviewer prompts and card output paths. |
<!-- ONX:CLI:END -->

For exact flags, examples, and the full command surface, rely on the generated CLI reference instead of duplicating command details in this README.

## Runtime safety / anti-hang controls

ONX now ships long-running runtime guards for Codex phases, with design inspiration from OMX:

- per-phase `.runtime.json` heartbeat files beside phase logs
- stall detection based on both stdout/stderr **and** output artifact growth
- automatic retry after stall/timeout
- artifact-complete rescue when Codex hangs after already writing the target file
- resume-safe phase skipping when the expected output file already exists and is meaningful
- tmux-aware stalled-run nudges before restart when mode state includes `tmuxPane`
- watchdog event logging for both `runtime.watchdog.nudged` and `runtime.watchdog.recovered`

Environment knobs:

```bash
ONX_PHASE_TIMEOUT_MS=3600000
ONX_PHASE_STALL_TIMEOUT_MS=600000
ONX_PHASE_MAX_ATTEMPTS=2
ONX_PHASE_POLL_INTERVAL_MS=2000
ONX_TMUX_NUDGE_COOLDOWN_MS=30000
ONX_TMUX_NUDGE_MAX_COUNT=3
ONX_TMUX_NUDGE_WINDOW_MS=600000
ONX_TMUX_MIN_WIDTH=20
ONX_TMUX_MIN_HEIGHT=8
```

Status commands now surface runtime health for each phase:

```bash
onx workflow-status --job <dir>
onx review-status --job <dir>
onx revision-status --job <dir>
onx status --project .
onx hud --project .
```

Watchdog recovery examples:

```bash
onx watchdog --project .                     # scan only
onx watchdog --project . --nudge-stalled    # recovery path is active even without --resume*; if mode metadata has tmuxPane, try a nudge first
onx watchdog --project . --nudge-stalled --resume-stalled   # nudge first, then restart stalled work if the nudge cannot be sent
onx watchdog --project . --resume           # auto-resume orphaned resumable jobs
onx watchdog --project . --resume-stalled --stalled-grace-ms 120000
onx watchdog --project . --resume-untracked --untracked-grace-ms 180000
```

Fallback watcher examples:

```bash
onx fallback-watcher --project . --resume --resume-stalled --resume-untracked
onx fallback-watcher --project . --follow-events --nudge-stalled   # active stalled-job nudging even without --resume-stalled
onx fallback-watcher --project . --once --dry-run
onx fallback-watcher --project . --follow-events --resume --resume-stalled
```

If you have a real tmux pane hosting the active ONX/Codex work, seed it into mode metadata when launching execution:

```bash
onx execute-workflow --job <dir> --tmux-pane %12
onx execute-review --job <dir> --tmux-pane %12
onx execute-revision --job <dir> --tmux-pane %12
onx team-run --job <dir> --tmux-pane %12
```

If you are already inside tmux, ONX will also auto-detect `TMUX_PANE` when these flags are omitted.

Practical note: avoid launching long-running team/tmux work from extremely narrow detached windows. ONX now treats panes narrower than `ONX_TMUX_MIN_WIDTH` or shorter than `ONX_TMUX_MIN_HEIGHT` as unhealthy for auto-nudge.

You can inspect or try to repair the current pane/window before starting:

```bash
onx tmux-guard --json
onx tmux-guard --apply --target-width 180 --target-height 50
```

The nudge path is intentionally conservative: ONX refuses to send a continuation message when the pane is dead, in copy-mode, or still running a shell that does not look prompt-ready. Cooldown and max-window controls live behind `ONX_TMUX_NUDGE_COOLDOWN_MS`, `ONX_TMUX_NUDGE_MAX_COUNT`, and `ONX_TMUX_NUDGE_WINDOW_MS`. `runtime.watchdog.nudged` is only emitted when a nudge is actually sent; if you also want stalled-job recovery when the nudge is blocked or exhausted, pair `--nudge-stalled` with `--resume-stalled`.

## License

This project is released under the [MIT License](./LICENSE).

## Acknowledgements

ONX was built with direct inspiration from and ongoing reference to
[`oh-my-codex`](https://github.com/Yeachan-Heo/oh-my-codex) by Yeachan Heo.

For attribution details, see [NOTICE.md](./NOTICE.md).

## Project health

- [Contributing guide](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)

## Project layout

```text
oh-novel-codex/
├── AGENTS.md
├── prompts/
├── skills/
├── templates/
├── docs/
└── src/
```

## Included prompts

See the generated prompt catalog at [`docs/prompts.md`](./docs/prompts.md).

## Included skills

See the generated skill catalog at [`docs/skills.md`](./docs/skills.md).

## Review agents pipeline

ONX now includes a dedicated review pipeline for finished drafts and rewrites.

Default review order:

1. `hook-doctor` — check opening pressure and chapter-end reading reasons
2. `character-doctor` — remove tool-character behavior
3. `ending-killshot-reviewer` — sharpen the final emotional strike
4. `remix-depth-reviewer` — check rewrite originality and skeleton divergence
5. `publish-gate-reviewer` — final ship / no-ship decision

The workflow skill for this is:

```text
$review-pipeline "review this finished draft and return prioritized fixes"
```

To scaffold the review job workspace:

```bash
onx run-review --draft drafts/chapter-01.md --source source/original.txt --project .
```

To execute reviewer lanes:

```bash
onx execute-review --latest --project . --parallel --dry-run
```

To execute reviewer lanes as a team runtime:

```bash
onx team-start --workflow-job .onx/workflows/jobs/<job> --project .
onx team-run --latest --project . --parallel --dry-run
```

ONX team runtime is lane-state driven: it records lane progress under `.onx/team/jobs/<job>/runtime/state.json`, mirrors the current lane in `.onx/state/modes/team.json`, and emits `team.lane.*` / watchdog events into `.onx/logs/events.jsonl`. It does **not** currently implement OMX-style leader mailboxes, per-worker inboxes, or worker status registries inside `.onx/team/`; for that heavier mailbox-driven coordination model, treat external OMX runtimes as optional interop rather than expecting ONX team jobs to behave like `.omx/state/team/...`.

If the reviewers write card files, aggregate them with:

```bash
onx review-aggregate .onx/reviews/cards --output .onx/reviews/final/latest.md
```

## Draft job pipeline

Create an original draft job:

```bash
onx run-draft --brief "写一个知乎体第一人称复仇短篇" --project .
```

Create a rewrite draft job:

```bash
onx run-draft --mode zhihu-remix --source source/original.txt --brief "改成8k-12k低相似度长稿" --project .
```
