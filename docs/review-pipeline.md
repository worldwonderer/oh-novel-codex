# Review pipeline

ONX review is designed as a **multi-agent fiction gate**, not a generic proofreading pass.

## Default order

1. **hook-doctor**
   - opening pressure
   - chapter-end pull
   - early reading reasons
2. **character-doctor**
   - side-character depth
   - anti-tool-character checks
3. **ending-killshot-reviewer**
   - final sting
   - last-page aftertaste
4. **remix-depth-reviewer**
   - rewrite originality
   - skeleton divergence from source
5. **publish-gate-reviewer**
   - final pass/fail

## Output contract

Each reviewer should return:

- verdict: pass / fail / mixed
- strongest evidence
- top 3 issues
- exact sections or scenes to patch
- priority: P0 / P1 / P2

Preferred machine-readable form:
- use the markdown contract in `docs/review-card-contract.md`
- store reviewer outputs under `.onx/reviews/cards/`
- aggregate with `onx review-aggregate`

The aggregate now also computes:

- a fiction quality scorecard (`hook`, `character`, `pacing`, `ending`, `originality`, `continuity`)
- a composite score
- publish-readiness thresholds + failing dimensions

## Ship rule

Do not ship if:
- hook pass returns a major opening failure
- ending review returns a soft or summary-like ending
- rewrite-depth returns scene-for-scene shadow-retell risk
- publish gate returns fail

## Best use

Use `$review-pipeline` after:
- a full draft
- a rewrite draft
- a post-polish draft that still feels slightly soft

Then merge the review cards:

```bash
onx review-aggregate .onx/reviews/cards --output .onx/reviews/final/latest.md
```
