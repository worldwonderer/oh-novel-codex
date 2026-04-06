# Zhihu remix automation showcase

This folder contains a local runnable ONX showcase for a real Zhihu-style rewrite workflow.

## Run

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs
```

To force a specific manuscript:

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs --source /path/to/source.md
```

To run the live workflow instead of dry-run:

```bash
node playground/showcases/zhihu-remix-automation/run-local-demo.mjs --live --source /path/to/source.md
```

## Notes

- The public repo does not vendor the full manuscript.
- The runner prefers a known local sample from the surrounding workspace if it exists.
- All generated outputs land under `workspace/`, which is gitignored.
