# ONX phase 1-5 implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade ONX across phases 1-5 with ONX-first identity cleanup, story memory v1, fiction quality scoring, threshold-driven workflow looping, and product/docs expansion.

**Architecture:** Extend the current ONX draft/review/revision/workflow backbone instead of replacing it. Introduce file-backed story memory assets and deterministic quality scores that can drive the existing revision loop and be surfaced consistently across CLI, MCP, verification, and docs.

**Tech Stack:** TypeScript, Node.js, built-in test runner, JSON/Markdown file assets, existing ONX CLI/MCP/runtime infrastructure

---

### Task 1: Lock the roadmap entry artifacts

**Files:**
- Create: `docs/plans/2026-04-08-onx-phase1-5-design.md`
- Create: `docs/plans/2026-04-08-onx-phase1-5-implementation.md`
- Create: `.omx/context/onx-phase1-5-20260408T151226Z.md`

**Step 1:** Save the approved design and implementation plan artifacts.

**Step 2:** Update Ralph state with the context snapshot path.

**Step 3:** Verify the files exist and are readable.

### Task 2: Implement ONX-first identity cleanup

**Files:**
- Modify: `src/runtime/attention.ts`
- Modify: `src/cli/status.ts`
- Modify: `src/cli/hud.ts`
- Modify: `src/team/omx-visibility.ts` (rename or replace with an interop-oriented helper)
- Test: `src/cli/__tests__/operator.test.ts`
- Test: any new interop/status helper tests

**Step 1:** Add or rename the OMX visibility helper to an ONX interop name.

**Step 2:** Replace `OMX Teams` wording in ONX user surfaces with optional interop wording.

**Step 3:** Preserve external `.omx` visibility as optional data rather than core ONX state.

**Step 4:** Update tests to assert the new wording and behavior.

### Task 3: Add story memory v1 data surfaces

**Files:**
- Modify: `src/config/generator.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/cli/command-metadata.ts`
- Modify: `src/cli/mcp-server.ts`
- Modify: `src/mcp/server.ts`
- Create: `src/memory/story-memory.ts`
- Create: `src/cli/story-memory-read.ts`
- Create: `src/cli/story-memory-write.ts`
- Create: `templates/story-memory/*.md`
- Test: `src/config/__tests__/generator.test.ts`
- Test: `src/cli/__tests__/index.test.ts`
- Test: `src/mcp/__tests__/server.test.ts`
- Test: new story-memory tests

**Step 1:** Extend project scaffold directories for character/world/relationship/timeline/voice/continuity assets.

**Step 2:** Add a small story-memory storage module for file-backed reads/writes and scaffold seeding.

**Step 3:** Add CLI commands for reading/writing story memory.

**Step 4:** Expose story memory tools through MCP.

**Step 5:** Cover scaffold, CLI, and MCP behavior with tests.

### Task 4: Add fiction quality scoring v1

**Files:**
- Modify: `src/review/types.ts`
- Modify: `src/review/aggregate.ts`
- Modify: `src/verification/verifier.ts`
- Test: `src/review/__tests__/aggregate.test.ts`
- Test: `src/verification/__tests__/verifier.test.ts`

**Step 1:** Define a typed fiction quality score model.

**Step 2:** Derive scores from aggregate review data.

**Step 3:** Extend verification outputs to include quality score/threshold status.

**Step 4:** Add regression tests for score calculation and verifier reporting.

### Task 5: Upgrade workflow looping to use explicit thresholds

**Files:**
- Modify: `src/workflow/types.ts`
- Modify: `src/workflow/runner.ts`
- Modify: `src/workflow/execute.ts`
- Test: `src/workflow/__tests__/execute.test.ts`

**Step 1:** Add quality-threshold configuration to workflow manifests/types.

**Step 2:** Update workflow execution to stop when thresholds pass and continue when they fail.

**Step 3:** Persist threshold evidence in iteration metadata.

**Step 4:** Add tests for threshold pass/fail loop behavior.

### Task 6: Productize docs and onboarding

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/mcp.md`
- Modify: `docs/workflow-pipeline.md`
- Modify: `docs/draft-pipeline.md`
- Modify: `docs/review-pipeline.md`
- Modify: `docs/revision-pipeline.md`
- Modify: `docs/team-runtime.md`
- Modify: `docs/index.md`
- Modify: `missions/README.md`

**Step 1:** Update docs to explain story memory, quality scores, and threshold-driven looping.

**Step 2:** Add ONX-first interop wording and onboarding guidance.

**Step 3:** Re-run generated docs checks after command surface changes.

### Task 7: Full verification

**Files:**
- Verify only

**Step 1:** Run targeted tests for the touched modules.

**Step 2:** Run `npm test`.

**Step 3:** Run doc/catalog/help checks if command/docs surfaces changed.

**Step 4:** Review resulting diffs for slop and consistency before completion.
