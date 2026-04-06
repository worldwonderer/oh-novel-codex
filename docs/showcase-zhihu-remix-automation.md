# Showcase: automated Zhihu remix flow

This is the first ONX showcase aimed at AI users who care about **vibe-writing with real workflow automation**.

## What this demo is trying to prove

ONX should feel like more than a pile of prompts. This showcase is designed to show three things quickly:

1. you can point ONX at a **real local manuscript**
2. it can run a **repeatable rewrite workflow**
3. the result stays **structurally recognizable** instead of mutating into a totally different story

## Demo profile

- genre lane: modern Zhihu-style relationship/backstab fiction
- workflow: `zhihu-remix` + review/workflow automation
- source strategy: **local manuscript only**

The repository does **not** vendor the full source text into the public tree. That keeps the showcase publish-safe while still letting local users run the exact workflow against a real manuscript.

## Fastest way to try it

From the repo root:

```bash
npm run build
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs
```

If the default local sample is not present, pass your own source file:

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs --source /path/to/source.md
```

By default the showcase runs in **dry-run** mode so you can inspect the generated ONX job structure safely.

To run the actual rewrite flow with Codex:

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs --live --source /path/to/source.md
```

## What the runner does

The runner launches:

```bash
onx run-workflow \
  --mode zhihu-remix \
  --source <source> \
  --brief-file <demo-brief> \
  --project <workspace> \
  --job-name zhihu-remix-automation-showcase \
  --execute
```

Dry-run adds `--dry-run`; live mode omits it.

## What to inspect afterwards

The showcase writes into:

```text
playground/showcases/zhihu-remix-automation/workspace/
```

Look at:

- `.onx/drafts/jobs/` — draft planning + prompt outputs
- `.onx/reviews/jobs/` — reviewer prompts, cards, and final aggregate
- `.onx/workflows/jobs/` — top-level orchestration state and runbook

The best first files to open are:

- draft brief
- workflow runbook
- review aggregate

## Why this is a strong first demo

It is:

- automated enough to feel product-like
- close enough to the original manuscript to feel trustworthy
- reproducible enough that a new user can try it in minutes

If ONX is doing its job, this demo should make the user think:

> “I can take one messy Zhihu稿, run one structured workflow, and get a cleaner finished version without babysitting every step.”
