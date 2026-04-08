export type CliCommandCategory =
  | 'bootstrap'
  | 'inspection'
  | 'state'
  | 'draft'
  | 'review'
  | 'workflow'
  | 'team'
  | 'runtime';

export type CliCommandDefinition = {
  id: string;
  command: string;
  syntax: string;
  summary: string;
  category: CliCommandCategory;
};

export const CLI_COMMAND_DEFINITIONS: readonly CliCommandDefinition[] = [
  { id: 'setup', command: 'setup', syntax: 'onx setup [--project <dir>] [--codex-home <dir>] [--force]', summary: 'Install prompts/skills and scaffold a novel project.', category: 'bootstrap' },
  { id: 'update', command: 'update', syntax: 'onx update [--project <dir>] [--codex-home <dir>]', summary: 'Refresh installed ONX assets and project scaffold.', category: 'bootstrap' },
  { id: 'uninstall', command: 'uninstall', syntax: 'onx uninstall [--codex-home <dir>] [--project <dir>] [--project-only] [--global-only]', summary: 'Remove installed ONX assets and optionally clean a project.', category: 'bootstrap' },
  { id: 'init', command: 'init', syntax: 'onx init [dir] [--force]', summary: 'Scaffold a fresh ONX project without reinstalling global assets.', category: 'bootstrap' },
  { id: 'doctor', command: 'doctor', syntax: 'onx doctor [--codex-home <dir>] [--project <dir>] [--json]', summary: 'Validate global assets plus local ONX scaffold health.', category: 'inspection' },
  { id: 'history', command: 'history', syntax: 'onx history [--project <dir>] [--mode <name>] [--kind <kind>] [--last N] [--json]', summary: 'Inspect ONX session and job event history.', category: 'inspection' },
  { id: 'hud', command: 'hud', syntax: 'onx hud [--project <dir>] [--json]', summary: 'Show a compact ONX runtime summary.', category: 'inspection' },
  { id: 'trace', command: 'trace', syntax: 'onx trace [--project <dir>] [--last N] [--json] [--summary]', summary: 'Inspect event trace logs or summaries.', category: 'inspection' },
  { id: 'status', command: 'status', syntax: 'onx status [--project <dir>] [--json]', summary: 'Show ONX mode and session state for the current project.', category: 'inspection' },
  { id: 'mcp-server', command: 'mcp-server', syntax: 'onx mcp-server [all|state|memory|trace|team|story]', summary: 'Launch a stdio MCP server for ONX surfaces.', category: 'runtime' },
  { id: 'mcp-config', command: 'mcp-config', syntax: 'onx mcp-config [--surface all|state|memory|trace|team|story] [--node <path>] [--onx <path>] [--output <file>]', summary: 'Generate MCP client config JSON for ONX servers.', category: 'runtime' },
  { id: 'note-write', command: 'note', syntax: 'onx note --text <content> [--section priority|working|manual] [--project <dir>]', summary: 'Write to the ONX notepad.', category: 'state' },
  { id: 'note-read', command: 'note', syntax: 'onx note --read [--section priority|working|manual] [--project <dir>]', summary: 'Read the ONX notepad.', category: 'state' },
  { id: 'notify-hook', command: 'notify-hook', syntax: 'onx notify-hook [--project <dir>] [--auto-watch] [--ensure-watcher] [--resume] [--nudge-stalled] [--resume-stalled] [--resume-untracked] [--dry-run] [--follow-events]', summary: 'Consume one ONX event and optionally trigger watcher recovery.', category: 'runtime' },
  { id: 'memory-read', command: 'memory-read', syntax: 'onx memory-read [--project <dir>]', summary: 'Read project memory JSON.', category: 'state' },
  { id: 'memory-write', command: 'memory-write', syntax: 'onx memory-write [--json <json> | --file <path>] [--merge] [--project <dir>]', summary: 'Write or merge project memory JSON.', category: 'state' },
  { id: 'story-list', command: 'story-list', syntax: 'onx story-list [--surface all|characters|world|relationships|timeline|voice|continuity] [--project <dir>] [--json]', summary: 'List story-memory collections or one collection.', category: 'state' },
  { id: 'story-read', command: 'story-read', syntax: 'onx story-read --collection <characters|world|relationships|timeline|voice|continuity> [--key <entry>] [--project <dir>] [--json]', summary: 'Read one story-memory entry or list a collection.', category: 'state' },
  { id: 'story-write', command: 'story-write', syntax: 'onx story-write --collection <characters|world|relationships|timeline|voice|continuity> --key <entry> [--text <content> | --file <path>] [--project <dir>]', summary: 'Write one story-memory entry.', category: 'state' },
  { id: 'continuity-report', command: 'continuity-report', syntax: 'onx continuity-report [--project <dir>] [--draft <file>] [--json]', summary: 'Summarize story-memory continuity health.', category: 'inspection' },
  { id: 'state-read', command: 'state-read', syntax: 'onx state-read --mode <name> [--project <dir>]', summary: 'Inspect one mode state file.', category: 'state' },
  { id: 'state-clear', command: 'state-clear', syntax: 'onx state-clear --mode <name> [--project <dir>]', summary: 'Clear one mode state file.', category: 'state' },
  { id: 'verify-job', command: 'verify-job', syntax: 'onx verify-job --kind draft|review|workflow --job <dir>', summary: 'Run structural verification on a draft/review/workflow job.', category: 'inspection' },
  { id: 'watchdog', command: 'watchdog', syntax: 'onx watchdog [--project <dir>] [--resume] [--nudge-stalled] [--resume-stalled] [--stalled-grace-ms <n>] [--resume-untracked] [--untracked-grace-ms <n>] [--dry-run] [--json] [--watch] [--interval-ms <n>]', summary: 'Scan active jobs for orphaned or stalled phases.', category: 'runtime' },
  { id: 'fallback-watcher', command: 'fallback-watcher', syntax: 'onx fallback-watcher [--project <dir>] [--once] [--follow-events] [--resume] [--nudge-stalled] [--resume-stalled] [--resume-untracked] [--dry-run] [--interval-ms <n>] [--idle-backoff-ms <n>]', summary: 'Run a lightweight fallback watcher loop.', category: 'runtime' },
  { id: 'run-draft', command: 'run-draft', syntax: 'onx run-draft --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>]', summary: 'Create a draft job with architecture, outline, and writing prompts.', category: 'draft' },
  { id: 'run-revision', command: 'run-revision', syntax: 'onx run-revision --draft <file> --review-job <dir> [--focus quality|all|originality] [--project <dir>] [--job-name <name>]', summary: 'Create a revision job from review findings.', category: 'draft' },
  { id: 'run-workflow', command: 'run-workflow', syntax: 'onx run-workflow --brief <text> [--brief-file <file>] [--source <file>] [--mode draft-longform|zhihu-remix] [--project <dir>] [--job-name <name>] [--execute] [--dry-run]', summary: 'Create the full draft + review workflow job chain.', category: 'workflow' },
  { id: 'team-start', command: 'team-start', syntax: 'onx team-start [--review-job <dir>] [--workflow-job <dir>] [--project <dir>] [--job-name <name>]', summary: 'Create a team runtime job around a review/workflow job.', category: 'team' },
  { id: 'team-run', command: 'team-run', syntax: 'onx team-run --job <dir> [--latest] [--project <dir>] [--parallel] [--serial] [--dry-run] [--from <lane>] [--to <lane>] [--force] [--tmux-pane <%id>]', summary: 'Execute or resume team reviewer lanes.', category: 'team' },
  { id: 'team-status', command: 'team-status', syntax: 'onx team-status --job <dir> [--latest] [--project <dir>]', summary: 'Show team lane runtime state.', category: 'team' },
  { id: 'tmux-guard', command: 'tmux-guard', syntax: 'onx tmux-guard [--pane <%id>] [--apply] [--json] [--min-width N] [--min-height N] [--target-width N] [--target-height N]', summary: 'Inspect or repair the current tmux pane layout before interactive work.', category: 'runtime' },
  { id: 'execute-revision', command: 'execute-revision', syntax: 'onx execute-revision --job <dir> [--latest] [--project <dir>] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]', summary: 'Execute or resume a revision job.', category: 'draft' },
  { id: 'execute-review', command: 'execute-review', syntax: 'onx execute-review --job <dir> [--latest] [--project <dir>] [--parallel] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]', summary: 'Execute or resume a review job.', category: 'review' },
  { id: 'revision-status', command: 'revision-status', syntax: 'onx revision-status --job <dir> [--latest] [--project <dir>]', summary: 'Show revision lane runtime state.', category: 'draft' },
  { id: 'review-status', command: 'review-status', syntax: 'onx review-status --job <dir> [--latest] [--project <dir>]', summary: 'Show review lane runtime state.', category: 'review' },
  { id: 'execute-workflow', command: 'execute-workflow', syntax: 'onx execute-workflow --job <dir> [--latest] [--project <dir>] [--dry-run] [--from <phase>] [--to <phase>] [--force] [--codex-cmd <cmd>] [--model <name>] [--profile <name>] [--sandbox <mode>] [--tmux-pane <%id>]', summary: 'Automatically run or resume phases for an existing workflow job.', category: 'workflow' },
  { id: 'workflow-status', command: 'workflow-status', syntax: 'onx workflow-status --job <dir> [--latest] [--project <dir>]', summary: 'Show phase-by-phase workflow runtime status.', category: 'workflow' },
  { id: 'run-review-create', command: 'run-review', syntax: 'onx run-review --draft <file> [--source <file>] [--project <dir>] [--job-name <name>] [--reviewers a,b,c]', summary: 'Create a review job with reviewer prompts and card output paths.', category: 'review' },
  { id: 'run-review-aggregate', command: 'run-review', syntax: 'onx run-review --job <dir> --aggregate [--format markdown|json] [--output <file>]', summary: 'Aggregate an existing review job into one final verdict.', category: 'review' },
  { id: 'review-aggregate', command: 'review-aggregate', syntax: 'onx review-aggregate <path> [--format markdown|json] [--output <file>]', summary: 'Merge reviewer cards into one final verdict.', category: 'review' },
  { id: 'version', command: 'version', syntax: 'onx version', summary: 'Print the current ONX package version.', category: 'inspection' },
] as const;

const CATEGORY_LABELS: Record<CliCommandCategory, string> = {
  bootstrap: 'Bootstrap',
  inspection: 'Inspection',
  state: 'State & memory',
  draft: 'Draft & revision',
  review: 'Review',
  workflow: 'Workflow',
  team: 'Team',
  runtime: 'Runtime',
};

export function renderHelpText(): string {
  return [
    'oh-novel-codex (onx)',
    '',
    'Commands:',
    ...CLI_COMMAND_DEFINITIONS.map((entry) => `  ${entry.syntax}`),
  ].join('\n');
}

export function renderCliReferenceMarkdown(): string {
  const sections = Object.entries(groupCommandsByCategory()).flatMap(([category, entries]) => {
    const heading = `## ${CATEGORY_LABELS[category as CliCommandCategory]}`;
    const table = [
      '| Command | Summary |',
      '| --- | --- |',
      ...entries.map((entry) => `| \`${entry.syntax}\` | ${entry.summary} |`),
      '',
    ];
    return [heading, '', ...table];
  });

  return [
    '# CLI Reference',
    '',
    '> Auto-generated from `src/cli/command-metadata.ts`. Do not edit by hand.',
    '',
    ...sections,
    '## Raw help output',
    '',
    '```text',
    renderHelpText(),
    '```',
    '',
  ].join('\n');
}

export function renderReadmeCommandSnippet(): string {
  const entries = CLI_COMMAND_DEFINITIONS.filter((entry) => [
    'setup',
    'doctor',
    'run-draft',
    'run-review-create',
    'run-workflow',
    'smoke:packed-install',
  ].includes(entry.id));

  const lines = [
    '<!-- ONX:CLI:START -->',
    '| Common command | Why you run it |',
    '| --- | --- |',
    ...entries.map((entry) => `| \`${entry.syntax}\` | ${entry.summary} |`),
    '<!-- ONX:CLI:END -->',
  ];
  return `${lines.join('\n')}\n`;
}

function groupCommandsByCategory(): Record<CliCommandCategory, CliCommandDefinition[]> {
  return CLI_COMMAND_DEFINITIONS.reduce<Record<CliCommandCategory, CliCommandDefinition[]>>((acc, entry) => {
    (acc[entry.category] ??= []).push(entry);
    return acc;
  }, {
    bootstrap: [],
    inspection: [],
    state: [],
    draft: [],
    review: [],
    workflow: [],
    team: [],
    runtime: [],
  });
}
