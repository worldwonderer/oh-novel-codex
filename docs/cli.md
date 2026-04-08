# CLI Reference

> Auto-generated from `src/cli/command-metadata.ts`. Do not edit by hand.

## Bootstrap

| Command | Summary |
| --- | --- |
| `onx setup [--project <dir>] [--codex-home <dir>] [--force]` | Install prompts/skills and scaffold a novel project. |
| `onx update [--project <dir>] [--codex-home <dir>]` | Refresh installed ONX assets and project scaffold. |
| `onx uninstall [--codex-home <dir>] [--project <dir>] [--project-only] [--global-only]` | Remove installed ONX assets and optionally clean a project. |
| `onx init [dir] [--force]` | Scaffold a fresh ONX project without reinstalling global assets. |

## Inspection

| Command | Summary |
| --- | --- |
| `onx doctor [--codex-home <dir>] [--project <dir>] [--json]` | Validate global assets plus local ONX scaffold health. |
| `onx history [--project <dir>] [--mode <name>] [--kind <kind>] [--last N] [--json]` | Inspect ONX session and job event history. |
| `onx hud [--project <dir>] [--json]` | Show a compact ONX runtime summary. |
| `onx trace [--project <dir>] [--last N] [--json] [--summary]` | Inspect event trace logs or summaries. |
| `onx status [--project <dir>] [--json]` | Show ONX mode and session state for the current project. |
| `onx continuity-report [--project <dir>] [--draft <file>] [--json]` | Summarize story-memory continuity health. |
| `onx verify-job --kind draft|review|workflow --job <dir>` | Run structural verification on a draft/review/workflow job. |
| `onx version` | Print the current ONX package version. |

## State & memory

| Command | Summary |
| --- | --- |
| `onx note --text <content> [--section priority|working|manual] [--project <dir>]` | Write to the ONX notepad. |
| `onx note --read [--section priority|working|manual] [--project <dir>]` | Read the ONX notepad. |
| `onx memory-read [--project <dir>]` | Read project memory JSON. |
| `onx memory-write [--json <json> | --file <path>] [--merge] [--project <dir>]` | Write or merge project memory JSON. |
| `onx story-list [--surface all|characters|world|relationships|timeline|voice|continuity] [--project <dir>] [--json]` | List story-memory collections or one collection. |
| `onx story-read --collection <characters|world|relationships|timeline|voice|continuity> [--key <entry>] [--project <dir>] [--json]` | Read one story-memory entry or list a collection. |
| `onx story-write --collection <characters|world|relationships|timeline|voice|continuity> --key <entry> [--text <content> | --file <path>] [--project <dir>]` | Write one story-memory entry. |
| `onx state-read --mode <name> [--project <dir>]` | Inspect one mode state file. |
| `onx state-clear --mode <name> [--project <dir>]` | Clear one mode state file. |

## Draft & revision

| Command | Summary |
| --- | --- |
| `onx run-draft --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>]` | Create a draft job with architecture, outline, and writing prompts. |
| `onx run-revision --draft <file> --review-job <dir> [--focus quality|all|originality] [--project <dir>] [--job-name <name>]` | Create a revision job from review findings. |
| `onx execute-revision --job <dir> [--latest] [--project <dir>] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]` | Execute or resume a revision job. |
| `onx revision-status --job <dir> [--latest] [--project <dir>]` | Show revision lane runtime state. |

## Review

| Command | Summary |
| --- | --- |
| `onx execute-review --job <dir> [--latest] [--project <dir>] [--parallel] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]` | Execute or resume a review job. |
| `onx review-status --job <dir> [--latest] [--project <dir>]` | Show review lane runtime state. |
| `onx run-review --draft <file> [--source <file>] [--project <dir>] [--job-name <name>] [--reviewers a,b,c]` | Create a review job with reviewer prompts and card output paths. |
| `onx run-review --job <dir> --aggregate [--format markdown|json] [--output <file>]` | Aggregate an existing review job into one final verdict. |
| `onx review-aggregate <path> [--format markdown|json] [--output <file>]` | Merge reviewer cards into one final verdict. |

## Workflow

| Command | Summary |
| --- | --- |
| `onx run-workflow --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>] [--execute] [--dry-run]` | Create the full draft + review workflow job chain. |
| `onx execute-workflow --job <dir> [--latest] [--project <dir>] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]` | Automatically run or resume phases for an existing workflow job. |
| `onx workflow-status --job <dir> [--latest] [--project <dir>]` | Show phase-by-phase workflow runtime status. |

## Team

| Command | Summary |
| --- | --- |
| `onx team-start [--review-job <dir>] [--workflow-job <dir>] [--project <dir>] [--job-name <name>]` | Create a team runtime job around a review/workflow job. |
| `onx team-run --job <dir> [--latest] [--project <dir>] [--parallel] [--serial] [--dry-run] [--from <lane>] [--to <lane>] [--force] [--tmux-pane <%id>]` | Execute or resume team reviewer lanes. |
| `onx team-status --job <dir> [--latest] [--project <dir>]` | Show team lane runtime state. |

## Runtime

| Command | Summary |
| --- | --- |
| `onx mcp-server [all|state|memory|trace|team|story]` | Launch a stdio MCP server for ONX surfaces. |
| `onx mcp-config [--surface all|state|memory|trace|team|story] [--node <path>] [--onx <path>] [--output <file>]` | Generate MCP client config JSON for ONX servers. |
| `onx notify-hook [--project <dir>] [--auto-watch] [--ensure-watcher] [--resume] [--nudge-stalled] [--resume-stalled] [--resume-untracked] [--dry-run] [--follow-events]` | Consume one ONX event and optionally trigger watcher recovery. |
| `onx watchdog [--project <dir>] [--resume] [--nudge-stalled] [--resume-stalled] [--stalled-grace-ms <n>] [--resume-untracked] [--untracked-grace-ms <n>] [--dry-run] [--json] [--watch] [--interval-ms <n>]` | Scan active jobs for orphaned or stalled phases. |
| `onx fallback-watcher [--project <dir>] [--once] [--follow-events] [--resume] [--nudge-stalled] [--resume-stalled] [--resume-untracked] [--dry-run] [--interval-ms <n>] [--idle-backoff-ms <n>]` | Run a lightweight fallback watcher loop. |
| `onx tmux-guard [--pane <%id>] [--apply] [--json] [--min-width N] [--min-height N] [--target-width N] [--target-height N]` | Inspect or repair the current tmux pane layout before interactive work. |

## Raw help output

```text
oh-novel-codex (onx)

Commands:
  onx setup [--project <dir>] [--codex-home <dir>] [--force]
  onx update [--project <dir>] [--codex-home <dir>]
  onx uninstall [--codex-home <dir>] [--project <dir>] [--project-only] [--global-only]
  onx init [dir] [--force]
  onx doctor [--codex-home <dir>] [--project <dir>] [--json]
  onx history [--project <dir>] [--mode <name>] [--kind <kind>] [--last N] [--json]
  onx hud [--project <dir>] [--json]
  onx trace [--project <dir>] [--last N] [--json] [--summary]
  onx status [--project <dir>] [--json]
  onx mcp-server [all|state|memory|trace|team|story]
  onx mcp-config [--surface all|state|memory|trace|team|story] [--node <path>] [--onx <path>] [--output <file>]
  onx note --text <content> [--section priority|working|manual] [--project <dir>]
  onx note --read [--section priority|working|manual] [--project <dir>]
  onx notify-hook [--project <dir>] [--auto-watch] [--ensure-watcher] [--resume] [--nudge-stalled] [--resume-stalled] [--resume-untracked] [--dry-run] [--follow-events]
  onx memory-read [--project <dir>]
  onx memory-write [--json <json> | --file <path>] [--merge] [--project <dir>]
  onx story-list [--surface all|characters|world|relationships|timeline|voice|continuity] [--project <dir>] [--json]
  onx story-read --collection <characters|world|relationships|timeline|voice|continuity> [--key <entry>] [--project <dir>] [--json]
  onx story-write --collection <characters|world|relationships|timeline|voice|continuity> --key <entry> [--text <content> | --file <path>] [--project <dir>]
  onx continuity-report [--project <dir>] [--draft <file>] [--json]
  onx state-read --mode <name> [--project <dir>]
  onx state-clear --mode <name> [--project <dir>]
  onx verify-job --kind draft|review|workflow --job <dir>
  onx watchdog [--project <dir>] [--resume] [--nudge-stalled] [--resume-stalled] [--stalled-grace-ms <n>] [--resume-untracked] [--untracked-grace-ms <n>] [--dry-run] [--json] [--watch] [--interval-ms <n>]
  onx fallback-watcher [--project <dir>] [--once] [--follow-events] [--resume] [--nudge-stalled] [--resume-stalled] [--resume-untracked] [--dry-run] [--interval-ms <n>] [--idle-backoff-ms <n>]
  onx run-draft --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>]
  onx run-revision --draft <file> --review-job <dir> [--focus quality|all|originality] [--project <dir>] [--job-name <name>]
  onx run-workflow --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>] [--execute] [--dry-run]
  onx team-start [--review-job <dir>] [--workflow-job <dir>] [--project <dir>] [--job-name <name>]
  onx team-run --job <dir> [--latest] [--project <dir>] [--parallel] [--serial] [--dry-run] [--from <lane>] [--to <lane>] [--force] [--tmux-pane <%id>]
  onx team-status --job <dir> [--latest] [--project <dir>]
  onx tmux-guard [--pane <%id>] [--apply] [--json] [--min-width N] [--min-height N] [--target-width N] [--target-height N]
  onx execute-revision --job <dir> [--latest] [--project <dir>] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]
  onx execute-review --job <dir> [--latest] [--project <dir>] [--parallel] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]
  onx revision-status --job <dir> [--latest] [--project <dir>]
  onx review-status --job <dir> [--latest] [--project <dir>]
  onx execute-workflow --job <dir> [--latest] [--project <dir>] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]
  onx workflow-status --job <dir> [--latest] [--project <dir>]
  onx run-review --draft <file> [--source <file>] [--project <dir>] [--job-name <name>] [--reviewers a,b,c]
  onx run-review --job <dir> --aggregate [--format markdown|json] [--output <file>]
  onx review-aggregate <path> [--format markdown|json] [--output <file>]
  onx version
```
