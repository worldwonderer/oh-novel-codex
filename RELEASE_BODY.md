# oh-novel-codex v0.1.0

Novel-first workflow layer for Codex CLI, now hardened with release-time guards inspired by `oh-my-codex`.

## Highlights

- CLI help, `docs/cli.md`, and the README command snippet now share one metadata source.
- `npm pack` validation and packed-install smoke now cover a real installed workflow:
  `setup -> doctor -> run-draft -> run-review -> run-workflow`.
- CI now enforces build, lint, test, and packed-install smoke gates before release publish.

## Verification

- `npm run build`
- `npm run lint`
- `npm test`
- `node dist/scripts/generate-catalog-docs.js --check`
- `node dist/scripts/generate-cli-docs.js --check`
- `npm run smoke:packed-install`

## Remaining risk

- Cross-platform differences still mainly rely on workflow matrix coverage and smoke scripts rather than deep environment-specific assertions.
- Installed smoke covers the minimum real workflow, not every subcommand or full production authoring session.
