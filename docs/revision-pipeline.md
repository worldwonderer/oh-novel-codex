# Revision pipeline

ONX revision is a targeted repair lane, not a full rewrite by default.

## Best use

Use it when:
- the draft is close but not shippable
- P0/P1 issues are concentrated in a few scenes
- quality matters more than full structural reinvention

## Create a revision job

```bash
onx run-revision --draft path/to/draft.md --review-job path/to/review-job --project .
```

## Output

A revision job creates:

- `brief.md`
- `prompts/01-fix-plan.md`
- `prompts/02-revision-writer.md`
- `prompts/03-review-handoff.md`
- `outputs/revision-plan.md`
- `outputs/revised-draft.md`

## Focus modes

- `quality` (default): ignore remix-depth as a hard blocker and fix publish quality first
- `all`: include originality/risk issues too
- `originality`: focus mainly on structural remix upgrades

Revision jobs also snapshot story-memory so fixes can preserve established character intent, world rules, relationship state, timeline order, voice profile, and open continuity constraints.
