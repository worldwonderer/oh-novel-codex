# Zhihu remix showcase design

## Goal

Ship one practical, attractive ONX showcase for AI users interested in vibe-writing:

- real local source manuscript
- end-to-end automation feel
- output stays recognizably close to the source
- reproducible walkthrough instead of a hand-wavy marketing page

## Chosen approach

Use a **single-source, end-to-end showcase** built around a modern Zhihu-style relationship/backstab manuscript.

Deliverables:

1. `docs/showcase-zhihu-remix-automation.md` — the public-facing demo narrative
2. `playground/showcases/zhihu-remix-automation/README.md` — local runner instructions
3. `playground/showcases/zhihu-remix-automation/demo-brief.md` — reusable rewrite brief
4. `playground/showcases/zhihu-remix-automation/run-local-demo.mjs` — one command to launch the workflow

## Why this approach

- Stronger than a pure doc page because it is runnable
- Safer than vendoring a full manuscript into the public repo
- Closer to ONX’s product promise: workflow automation over one-off prompt magic

## Constraints

- Do not commit the full source manuscript into the public repo
- Keep the demo safe by default: dry-run unless the user opts into live execution
- Use existing CLI/workflow surfaces instead of inventing a new command

## Workflow

Default local demo command:

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs
```

Behavior:

- uses a curated local default source if available
- otherwise asks for `--source <path>`
- writes into an isolated local `workspace/`
- runs `onx run-workflow --mode zhihu-remix ... --execute --dry-run`

Optional live mode:

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs --live --source <path>
```

## Verification

- docs page exists and is linked from docs index / README
- showcase runner exists and is referenced from docs
- local dry-run execution succeeds and produces workflow job artifacts
