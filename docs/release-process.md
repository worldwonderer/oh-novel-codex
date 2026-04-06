# Release process

Use this checklist when cutting an ONX release.

## Preconditions

- `package.json.version` is final
- `src/catalog/manifest.json.catalogVersion` matches the package version
- `CHANGELOG.md` and `RELEASE_BODY.md` are updated for the release

## Local release gates

Run these in order:

```bash
npm run build
npm run lint
npm test
node dist/scripts/generate-catalog-docs.js --check
node dist/scripts/generate-cli-docs.js --check
npm run smoke:packed-install
```

## Tagging

Create a tag that exactly matches the package version:

```bash
git tag v<package-version>
git push origin v<package-version>
```

## GitHub Actions gates

The release workflow will enforce:

- version sync (`package.json` + catalog + tag)
- release quality gates (`build`, `lint`, `test`)
- cross-platform packed-install smoke
- `npm pack --dry-run`
- npm publish with provenance

## Publishing notes

- The GitHub release body is sourced from `RELEASE_BODY.md`.
- `CHANGELOG.md` should already contain the release summary before the tag is pushed.
