# Changelog

All notable changes to `oh-novel-codex` should be recorded in this file.

The format is intentionally lightweight:

- newest release first
- short summary bullets
- verification highlights when a release cut is prepared

## Unreleased

## 0.1.1

### Added
- GitHub community health files, issue templates, PR template, and repository metadata for first public project launch
- CI and release workflows with contract tests
- packed-install smoke coverage for `setup -> doctor -> run-draft -> run-review -> run-workflow`
- CLI metadata-driven docs, docs index generation, and README/docs navigation sync guards
- `NOTICE.md` attribution file acknowledging `oh-my-codex`

### Changed
- release and packaging guardrails now cover generated docs, package metadata, release docs, and GitHub readiness checks
- installed workflow smoke now validates real post-install job scaffolding instead of only CLI boot behavior

## 0.1.0

### Added
- initial ONX CLI, prompt catalog, skill catalog, draft/review/revision/workflow runners
- project scaffold, state/memory helpers, MCP surfaces, runtime watchdogs, and publish-readiness review flow
