# ONX roadmap execution design

## Goal
Land the approved roadmap as a code-first foundation rather than a long-horizon slide deck: clean up ONX identity boundaries, introduce durable story-memory primitives, enrich fiction-quality evaluation, strengthen workflow revision stopping logic, and expand product documentation so the system becomes more ONX-native and more useful for sustained novel work.

## Chosen approach
1. Start with **Phase 1 identity cleanup** because it reduces architectural drag everywhere else.
2. Add **Phase 2 story memory v1** as lightweight but durable primitives integrated into scaffolding, doctor/setup, MCP, and docs.
3. Extend existing review aggregation into **Phase 3 quality scoring** instead of inventing a second evaluation system.
4. Upgrade the workflow loop for **Phase 4 threshold-aware revision** by reusing aggregate outputs and making stopping criteria explicit.
5. Finish with **Phase 5 productization** so docs and showcase material reflect the new capabilities.

## Boundaries
- Do not attempt full OMX parity.
- Do not add unrelated generic skills.
- Prefer scaffold/data/model additions and integration seams over heavyweight orchestration rewrites.

## Key design decisions
- Treat story memory as ONX-owned project assets under `.onx/story/` plus continuity reports under `.onx/continuity/`.
- Make external OMX visibility optional/interoperable, not part of ONX’s core identity.
- Represent fiction quality with structured scores attached to aggregate review output so downstream revision logic can consume them.
- Keep workflow quality loops deterministic enough for tests by using explicit thresholds and bounded iteration counts.
