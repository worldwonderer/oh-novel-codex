# Contributing to oh-novel-codex

Thanks for contributing to ONX.

## Development setup

```bash
npm install
npm run build
npm run lint
npm test
npm run smoke:packed-install
```

## Expected quality gates

Before opening a pull request, run these in order:

```bash
npm run build
npm run help:generate
npm run docs-index:generate
npm run lint
npm test
npm run smoke:packed-install
```

## Contribution guidelines

- Keep diffs small and reviewable.
- Prefer extending the existing metadata-driven docs and workflow guardrails instead of adding duplicate sources of truth.
- Update generated artifacts when command metadata, docs navigation metadata, prompt catalogs, or skill catalogs change.
- Add or update tests when behavior, packaging, release, or workflow contracts change.
- If you modify release behavior, update `CHANGELOG.md`, `RELEASE_BODY.md`, and `docs/release-process.md` together.

## Pull request checklist

- [ ] Build passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Packed-install smoke passes
- [ ] Generated docs are refreshed if needed
- [ ] Changelog / release docs updated when release behavior changed
