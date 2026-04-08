# Quality engine

ONX review aggregation now produces a structured quality scorecard instead of only a ship/revise label.

## Dimensions

The scorecard tracks six dimensions:

- `hook`
- `character`
- `pacing`
- `ending`
- `originality`
- `continuity`

Each dimension gets:

- a numeric score
- a strength band (`strong`, `watch`, `weak`)
- supporting reasons pulled from reviewer evidence

## Publish readiness

ONX converts the scorecard into a publish-readiness gate.

The gate records:

- whether the draft is publish-ready
- which dimensions failed threshold
- the exact thresholds applied for this source ownership mode

For self-owned adaptations, originality remains visible but the gate is less punitive than it is for third-party rewrite work.

## Where it appears

- `onx review-aggregate`
- `.onx/reviews/jobs/<job>/final/aggregate.md`
- workflow manifests and workflow iteration records

## Why it matters

This gives revision routing a more stable signal than plain verdict labels:

- if `originality` fails hard on third-party rewrite work, ONX can choose a broader structural rebuild
- if `hook` and `ending` fail while originality is acceptable, ONX can stay in a quality-patch lane
- if `continuity` fails, ONX can keep revision pressure on world/character/timeline drift instead of only scene polish

## Threshold-aware workflow loops

Workflow execution now respects publish-readiness thresholds instead of stopping only on a simple `ship` verdict.

That means a workflow can continue revising when:

- the review aggregate still says publish readiness is false
- one or more quality dimensions remain under threshold
- originality risk still blocks third-party rewrite work
