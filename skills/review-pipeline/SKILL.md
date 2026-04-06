---
name: review-pipeline
description: Run a multi-agent fiction review pass on a finished draft or rewrite. Use when a story is complete enough for review and you want coordinated checks for hook strength, side-character depth, ending impact, rewrite originality, and final ship/no-ship readiness.
---

# Review pipeline

Run this default order:

1. `hook-doctor`
2. `character-doctor`
3. `ending-killshot-reviewer`
4. `remix-depth-reviewer` when source-based or rewrite-based
5. `publish-gate-reviewer`

Reviewer output contract:
- use the markdown contract in `docs/review-card-contract.md`
- prefer writing reviewer cards into `.onx/reviews/cards/`
- merge them with `onx review-aggregate .onx/reviews/cards --output .onx/reviews/final/latest.md`

Return:
- overall verdict
- P0 / P1 / P2 fixes
- exact sections to patch
- whether the draft is ready to ship

Do not turn this into generic proofreading.
Bias toward:
- hook density
- character depth
- ending force
- remix depth
- publish readiness
