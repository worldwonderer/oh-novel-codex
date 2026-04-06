# Review card contract

ONX automatic review aggregation expects reviewer outputs in a small, predictable markdown contract.

## Required shape

```md
---
reviewer: hook-doctor
verdict: fail
priority: P0
confidence: high
ship: no-ship
---

# Review card

## Strongest evidence
- first paragraph lacks a real anomaly

## Top issues
- [P0] opening hook is too soft
- [P1] chapter 2 loses reading momentum

## Sections to patch
- opening scene
- chapter 2 beat 3

## Ship recommendation
- no-ship
```

## Notes

- `reviewer` should identify the prompt or review lane.
- `verdict` should be `pass`, `mixed`, or `fail`.
- `priority` is the reviewer's top-level severity: `P0`, `P1`, or `P2`.
- `confidence` should be `low`, `medium`, or `high`.
- `ship` should be `ship`, `revise`, or `no-ship`.
- `Top issues` should prefix each issue with `[P0]`, `[P1]`, or `[P2]`.

## Aggregation command

```bash
onx review-aggregate .onx/reviews/cards --output .onx/reviews/final/latest.md
```

The aggregator reads all `*.md` files under the target directory, merges the review cards, and writes a single final summary.
