# State, memory, and trace

ONX now exposes lightweight runtime surfaces for:

- **state** — current mode state files
- **memory** — project memory JSON + notepad sections
- **trace** — event log inspection and summaries

## Notepad

Backed by:

```text
.onx/notepad.md
```

Sections:
- `priority`
- `working`
- `manual`

Examples:

```bash
onx note --text "Need stronger ending in chapter 4" --section working --project .
onx note --read --section working --project .
```

## Project memory

Backed by:

```text
.onx/project-memory.json
```

Examples:

```bash
onx memory-write --json '{"style":{"tone":"mobile-first"}}' --merge --project .
onx memory-read --project .
```

## State

Mode state files live under:

```text
.onx/state/modes/
```

Examples:

```bash
onx state-read --mode workflow --project .
onx state-clear --mode review --project .
```

## Trace

Trace is backed by:

```text
.onx/logs/events.jsonl
```

Examples:

```bash
onx trace --project . --last 10
onx trace --project . --summary
```
