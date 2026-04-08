# Story memory & continuity

ONX story memory turns recurring fiction facts into reusable project assets.

## What lives in story memory

ONX keeps story-memory entries under:

- `.onx/characters/`
- `.onx/world/`
- `.onx/relationships/`
- `.onx/timeline/`
- `.onx/voice/`
- `.onx/continuity/`

Each collection is file-backed markdown so the assets are easy to diff, edit, and review.

## Starter scaffold

`onx setup --project .` now seeds starter entries for every collection:

- `characters/index.md`
- `world/index.md`
- `relationships/index.md`
- `timeline/index.md`
- `voice/index.md`
- `continuity/index.md`

Replace the placeholders as your draft matures.

## CLI workflow

List current story-memory entries:

```bash
onx story-list --surface all --project .
```

Read one entry:

```bash
onx story-read --collection characters --key lead-hero --project .
```

Write/update one entry:

```bash
onx story-write --collection timeline --key chapter-03 --text "# Chapter 03\n\n- Midnight confrontation at the dock."
```

Generate a continuity report:

```bash
onx continuity-report --project .
onx continuity-report --project . --draft .onx/drafts/jobs/<job>/outputs/draft.md
```

## How ONX uses it

- `run-draft` writes a story-memory snapshot into the job workspace.
- `run-review` includes the story-memory snapshot so reviewers can catch continuity drift.
- `run-revision` carries the same snapshot forward so repair prompts can preserve names, leverage, and chronology.

## Continuity report

The continuity report highlights:

- unresolved checklist items in `.onx/continuity/`
- missing authored collections (for example no real character bible yet)
- optional draft keyword coverage against tracked story-memory entries

Use it before long revisions or chapter handoffs to avoid accidental contradictions.
