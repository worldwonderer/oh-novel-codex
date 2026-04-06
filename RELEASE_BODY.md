# oh-novel-codex v0.1.1

Patch release that turns ONX into a fully publishable standalone GitHub project with release gates, generated docs, and installed workflow smoke validation.

## Highlights

- GitHub project readiness is now built in: repository metadata, community health files, issue/PR templates, CODEOWNERS, license, and notice attribution.
- CLI help, `docs/cli.md`, `docs/index.md`, and README snippets now come from metadata-driven generation with drift checks.
- Packed-install smoke now validates a real installed workflow: `setup -> doctor -> run-draft -> run-review -> run-workflow`.
- CI and release workflows now enforce build, lint, test, docs checks, and packed-install smoke before publish.

## Verification

- `npm run build`
- `npm run help:generate`
- `npm run docs-index:generate`
- `npm run lint`
- `npm test`
- `node dist/scripts/generate-catalog-docs.js --check`
- `node dist/scripts/generate-cli-docs.js --check`
- `node dist/scripts/generate-docs-index.js --check`
- `npm run smoke:packed-install`

## Remaining risk

- Cross-platform differences still rely on GitHub Actions matrix coverage plus smoke scripts rather than deeper platform-specific assertions.
- Installed smoke covers the key workflow path, but not every subcommand or long-running production authoring session.
