# ONX roadmap implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Land the roadmap foundations for phases 1-5 across code, docs, and tests.

**Architecture:** Build on current ONX primitives instead of replacing them: refactor naming/interoperability seams, introduce a small story-memory subsystem, extend review aggregation with structured quality scores, make workflow revision loops threshold-aware, and document the resulting product surface.

**Tech Stack:** TypeScript, Node.js, markdown docs, existing ONX CLI/MCP/runtime/test harness.

---

### Task 1: Grounding artifacts and docs
**Files:**
- Create: `docs/plans/2026-04-08-onx-roadmap-design.md`
- Create: `docs/plans/2026-04-08-onx-roadmap-implementation.md`
- Create: `.omx/context/onx-roadmap-20260408T151500Z.md`

### Task 2: Phase 1 ONX identity cleanup
**Files:**
- Modify: `src/team/omx-visibility.ts` (rename/re-scope as external interop)
- Modify: `src/runtime/attention.ts`
- Modify: `src/cli/status.ts`
- Modify: `src/cli/hud.ts`
- Modify: `docs/team-runtime.md`, `README.md`
- Test: `src/cli/__tests__/*`, `src/runtime/__tests__/*`

### Task 3: Phase 2 story memory v1
**Files:**
- Modify: `src/config/generator.ts`, `src/cli/setup.ts`, `src/cli/update.ts`, `src/cli/doctor.ts`, `src/cli/index.ts`, `src/cli/command-metadata.ts`
- Create: `src/story/*`
- Modify: `src/mcp/server.ts`, `docs/mcp.md`
- Create: `templates/story-*.md`
- Test: `src/config/__tests__/generator.test.ts`, `src/mcp/__tests__/server.test.ts`, new `src/story/__tests__/*`

### Task 4: Phase 3 quality engine v1
**Files:**
- Modify: `src/review/types.ts`, `src/review/aggregate.ts`, `src/verification/verifier.ts`
- Modify: `src/revision/runner.ts`, `src/workflow/execute.ts`
- Test: `src/review/__tests__/aggregate.test.ts`, `src/workflow/__tests__/execute.test.ts`, new verification tests

### Task 5: Phase 4 workflow thresholds
**Files:**
- Modify: `src/workflow/runner.ts`, `src/workflow/execute.ts`, `src/workflow/types.ts`
- Modify: docs for workflow/revision/review pipelines
- Test: `src/workflow/__tests__/execute.test.ts`

### Task 6: Phase 5 docs/productization
**Files:**
- Modify: `README.md`, `docs/index.md`, `docs/getting-started.md`, `docs/draft-pipeline.md`, `docs/review-pipeline.md`, `docs/revision-pipeline.md`, `docs/workflow-pipeline.md`
- Create: story-memory / quality-engine focused docs and showcase artifacts
- Test: `src/docs/__tests__/navigation-metadata.test.ts`, docs-generation checks

### Task 7: Full verification
**Commands:**
- `npm run build`
- `npm test`
- targeted test invocations while iterating
