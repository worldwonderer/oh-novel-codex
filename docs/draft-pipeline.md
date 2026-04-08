# Draft pipeline

ONX draft jobs create a structured workspace for long-form fiction work before review.

## Default order

1. **novel-architect**
   - premise
   - conflict ladder
   - chapter shape
2. **outline-planner**
   - beat budget
   - escalation order
   - mini-payoff placement
3. **scene-writer**
   - draft the finished story
4. **review handoff**
   - prepare the draft for `onx run-review`

## Create a job

```bash
onx run-draft --brief "写一个知乎体复仇短篇" --project .
```

For source-based rewrite work:

```bash
onx run-draft --mode zhihu-remix --source source/original.txt --brief "改成8k-12k低相似度长稿" --project .
```

## Job outputs

A draft job creates:

- `manifest.json`
- `brief.md`
- `story-memory.md`
- `prompts/`
- `outputs/architecture.md`
- `outputs/outline.md`
- `outputs/draft.md`
- `handoff/review-brief.md`

If the project already has story-memory entries under `.onx/characters`, `.onx/world`, `.onx/relationships`, `.onx/timeline`, `.onx/voice`, or `.onx/continuity`, ONX snapshots them into the draft job so planning and drafting prompts can preserve continuity.

## Next step

After the draft exists:

```bash
onx run-review --draft .onx/drafts/jobs/<job>/outputs/draft.md --source source/original.txt --project .
```
