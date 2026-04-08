# Showcase: story memory + quality gate loop

This showcase demonstrates the two ONX upgrades that make longer fiction work more stable:

1. **story memory** keeps recurring facts editable and reviewable
2. **quality gating** turns reviewer evidence into structured thresholds

## Suggested walkthrough

1. Bootstrap a project:

```bash
onx setup --project .
```

2. Fill the starter story-memory entries with real values:

```bash
onx story-read --collection characters --key index --project .
onx story-write --collection characters --key cast --file ./notes/cast.md --project .
```

3. Create a workflow job:

```bash
onx run-workflow --brief "写一个知乎体第一人称复仇短篇" --project .
```

4. Execute it or dry-run it:

```bash
onx execute-workflow --latest --project . --dry-run
```

5. Inspect the review aggregate and continuity report:

```bash
onx review-aggregate .onx/reviews/cards --output .onx/reviews/final/latest.md
onx continuity-report --project . --draft .onx/drafts/jobs/<job>/outputs/draft.md
```

## What to inspect

- whether reviewer cards cite continuity/story-memory problems instead of vague drift complaints
- whether the aggregate scorecard identifies the failing dimensions clearly
- whether the workflow manifest records quality thresholds and revision-loop outcomes

## Why this matters

Without story memory, long-form fiction tools drift.
Without quality gating, revision loops become subjective and brittle.

This ONX path keeps both the content facts and the quality bar visible in plain files.
