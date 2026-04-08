# ONX phase 1-5 design

## Goal

Land the approved roadmap as one coherent ONX-first upgrade: remove visible OMX coupling, add novel project memory surfaces, add structured fiction quality scoring, strengthen autonomous revision loops, and expand the docs/product surface enough for outside users to understand the system.

## Design summary

The implementation is intentionally incremental and fiction-first:

1. **Identity cleanup** keeps optional OMX interop but moves it behind ONX language and ONX-owned status surfaces.
2. **Story memory v1** introduces explicit `.onx/characters`, `.onx/world`, `.onx/relationships`, `.onx/timeline`, `.onx/voice`, and `.onx/continuity` scaffolds plus read/write interfaces.
3. **Quality engine v1** adds lightweight, deterministic fiction scores derived from the existing aggregate review model instead of introducing a heavy new dependency or opaque model call.
4. **Workflow looping** upgrades the existing revision loop to stop on explicit quality thresholds rather than only ship/no-ship text.
5. **Productization** updates onboarding, MCP docs, workflow docs, and catalog/help surfaces so the new system is discoverable.

## Main architecture decisions

### 1) Keep existing ONX pipelines and extend them

The draft/review/revision/workflow runners already form a usable backbone. We will extend them instead of introducing a separate orchestration stack.

### 2) Treat story memory as structured project assets, not prompt-only lore

Story memory is implemented as first-class `.onx/` directories plus JSON/Markdown assets that can be scaffolded, read, written, and surfaced through MCP.

### 3) Make quality scoring deterministic and inspectable

The quality engine will derive scores and thresholds from the existing aggregated review data so the behavior is testable and regressions are easy to catch.

### 4) Keep OMX interop optional and renamed

External OMX team visibility remains available for users who layer OMX around ONX, but all ONX-owned user-facing surfaces should describe it as optional interop rather than core ONX identity.

## Phase mapping

### Phase 1 — ONX-first cleanup
- Rename OMX-specific visibility helpers to interop-oriented names.
- Remove `OMX Teams` wording from ONX user surfaces.
- Update docs to describe external OMX visibility as optional interop.

### Phase 2 — Story memory v1
- Scaffold new `.onx/` directories.
- Add story memory templates and docs.
- Add CLI + MCP read/write surfaces.

### Phase 3 — Quality engine v1
- Add aggregate-derived fiction quality scores.
- Extend verification to report score and threshold status.
- Surface results in workflow summaries and docs.

### Phase 4 — Autonomous revision loop
- Add explicit quality thresholds to workflow manifests.
- Loop until thresholds pass or the max loop count is reached.
- Persist iteration evidence for later inspection.

### Phase 5 — Productization/docs
- Expand getting-started, MCP, workflow, and team docs.
- Add roadmap-aligned examples and mission scaffolding.

## Risks

- Existing dirty workspace changes overlap the quality/revision files. Mitigation: add narrow tests first and patch carefully.
- Story memory could sprawl. Mitigation: keep v1 read/write APIs simple and file-backed.
- Quality scores could feel arbitrary. Mitigation: publish the rubric and derive scores from existing review data.

## Verification plan

- Keep `npm test` green throughout.
- Add focused regression tests for scaffold, CLI, MCP, status/HUD wording, quality scoring, and workflow loop thresholds.
- Re-run generated doc checks after command/catalog/doc changes.
