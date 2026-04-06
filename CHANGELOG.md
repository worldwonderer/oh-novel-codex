# Changelog

All notable changes to `oh-novel-codex` should be recorded in this file.

The format is intentionally lightweight:

- newest release first
- short summary bullets
- verification highlights when a release cut is prepared

## Unreleased

### Added
- release and CI workflow contract tests
- packed-install smoke coverage for `setup -> doctor -> run-draft -> run-review -> run-workflow`
- CLI metadata-driven help/docs/README command generation

### Changed
- package/install/release guardrails now mirror more of the `oh-my-codex` engineering discipline
- generated docs and README command snippets now share one CLI metadata source

## 0.1.0

### Added
- initial ONX CLI, prompt catalog, skill catalog, draft/review/revision/workflow runners
- project scaffold, state/memory helpers, MCP surfaces, runtime watchdogs, and publish-readiness review flow
