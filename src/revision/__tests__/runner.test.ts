import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewJob } from '../../review/runner.js';
import { executeReviewJob } from '../../review/runner.js';
import { createRevisionJob } from '../runner.js';

test('createRevisionJob scaffolds quality-focused revision prompts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft\n', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    projectDir: root,
  });
  await executeReviewJob({ jobDir: reviewJob.jobDir, dryRun: true });

  const revision = await createRevisionJob({
    draftPath: draft,
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
    focus: 'quality',
  });

  const prompts = await fs.readdir(revision.promptsDir);
  assert.ok(prompts.includes('01-fix-plan.md'));
  assert.ok(prompts.includes('02-revision-writer.md'));
  const brief = await fs.readFile(path.join(revision.jobDir, 'brief.md'), 'utf8');
  assert.match(brief, /Publish quality verdict/);
});

test('createRevisionJob injects structural remix hard-stops for non-quality revisions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-remix-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft\n', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    sourcePath: draft,
    projectDir: root,
  });
  await executeReviewJob({ jobDir: reviewJob.jobDir, dryRun: true });

  const revision = await createRevisionJob({
    draftPath: draft,
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
    focus: 'all',
  });

  const fixPlanPrompt = await fs.readFile(path.join(revision.promptsDir, '01-fix-plan.md'), 'utf8');
  assert.match(fixPlanPrompt, /Identify the two most recognizable source-shadow hinges/);
  assert.match(fixPlanPrompt, /Replace at least one major hinge family entirely/);

  const manifest = JSON.parse(await fs.readFile(path.join(revision.jobDir, 'manifest.json'), 'utf8')) as {
    strategy?: string;
  };
  const writerPrompt = await fs.readFile(path.join(revision.promptsDir, '02-revision-writer.md'), 'utf8');
  assert.match(writerPrompt, /public discovery -> scolding call -> public downgrade -> public detonation -> repeated return visits/);
  assert.match(writerPrompt, /public-display discovery -> same-night confrontation -> next-day visual confirmation/);
  assert.match(writerPrompt, /the rival is wearing the heroine’s ceremonial object for an important visit/);
  assert.match(writerPrompt, /symbolic object may keep at most one of these jobs/);
  assert.match(writerPrompt, /formal ceremony \/ signing \/ registration table as a near-substitute reveal/);
  assert.match(writerPrompt, /ex-partner pleading -> public disgrace recap -> months-later stage declaration/);
  assert.match(writerPrompt, /doorstep pleading scene with the same "you loved the useful\/forgiving version of me" diagnosis/);
  if (manifest.strategy === 'structural-rebuild') {
    assert.match(writerPrompt, /This cycle is structure-first/);
    assert.match(writerPrompt, /Execute the hinge replacements before polishing hooks or prose-level style/);
  } else {
    assert.equal(manifest.strategy, 'quality-patch');
    assert.match(writerPrompt, /Treat this as a focused publish-quality patch pass/);
    assert.match(writerPrompt, /Prefer compression, reorder, and scene-surgery over rebuilding the whole machine/);
  }
  assert.match(writerPrompt, /move explanatory backstory behind the first decisive action turn/);
  assert.match(writerPrompt, /do not append hot-search\/news-cycle callbacks or a second thesis line/);
  assert.match(writerPrompt, /Give the rival a concrete objective, knowledge boundary, and self-protection move/);
  assert.match(writerPrompt, /Make at least one ally refuse, delay, bargain, or impose a condition/);
  assert.match(writerPrompt, /show the exact leverage they hold over the heroine/);
  assert.match(writerPrompt, /By paragraph 3, make sure the draft has surfaced both the external system threat and the heroine’s private\/personal loss/);
  assert.match(writerPrompt, /do not repeat the same refusal\/negotiation\/explanation function/);
  assert.match(writerPrompt, /distinct diction, leverage, and decision logic/);
  assert.match(writerPrompt, /keep one dominant terminal action\/image and one dominant terminal line/);
});

test('createRevisionJob escalates quality revisions to structural rebuild when routing says so', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-structure-route-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft\n', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    projectDir: root,
  });
  await executeReviewJob({ jobDir: reviewJob.jobDir, dryRun: true });

  await fs.writeFile(
    path.join(reviewJob.cardsDir, 'publish-gate-reviewer.md'),
    `---
reviewer: publish-gate-reviewer
verdict: mixed
priority: P1
confidence: high
ship: revise
---

# Review card

## Strongest evidence
- the middle still repeats explanation without changing the board

## Top issues
- [P1] The main beat ladder still shadows the source too neatly.
- [P1] Chapter 5 sits in the same begging-after-loss slot and burns ending acceleration.

## Sections to patch
- Chapter 1 opener discovery engine
- Chapter 5 interception and ending landing

## Ship recommendation
- revise
`,
    'utf8',
  );

  const revision = await createRevisionJob({
    draftPath: draft,
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
    focus: 'quality',
  });

  const manifest = JSON.parse(await fs.readFile(path.join(revision.jobDir, 'manifest.json'), 'utf8')) as {
    strategy?: string;
  };
  assert.equal(manifest.strategy, 'structural-rebuild');

  const brief = await fs.readFile(path.join(revision.jobDir, 'brief.md'), 'utf8');
  assert.match(brief, /Recommended revision strategy: structural-rebuild/);
  assert.match(brief, /## Repair routing/);

  const writerPrompt = await fs.readFile(path.join(revision.promptsDir, '02-revision-writer.md'), 'utf8');
  assert.match(writerPrompt, /This cycle is structure-first/);
  assert.match(writerPrompt, /Fix board shape, not just lines/);
  assert.match(writerPrompt, /Protect the kill shot by compressing any pre-ending pleading or explanation/);
});

test('createRevisionJob injects pacing-compression instructions when late-stage drag dominates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onx-revision-pacing-route-'));
  const draft = path.join(root, 'draft.md');
  await fs.writeFile(draft, '# draft\n', 'utf8');

  const reviewJob = await createReviewJob({
    draftPath: draft,
    sourceOwnership: 'self-owned',
    projectDir: root,
  });
  await executeReviewJob({ jobDir: reviewJob.jobDir, dryRun: true });

  await fs.writeFile(
    path.join(reviewJob.cardsDir, 'ending-killshot-reviewer.md'),
    `---
reviewer: ending-killshot-reviewer
verdict: mixed
priority: P1
confidence: high
ship: revise
---

# Review card

## Strongest evidence
- the real climax already landed before the procedural cleanup

## Top issues
- [P1] Chapter 5 spends too much voltage on recovery procedure after the real climax.
- [P1] The final line states the theme too directly instead of leaving a harder aftertaste.

## Sections to patch
- Chapter 5 from the first核验 scene to the final line

## Ship recommendation
- revise
`,
    'utf8',
  );

  await fs.writeFile(
    path.join(reviewJob.cardsDir, 'publish-gate-reviewer.md'),
    `---
reviewer: publish-gate-reviewer
verdict: mixed
priority: P1
confidence: high
ship: ship
---

# Review card

## Strongest evidence
- freshness is already good enough in this new format

## Top issues
- [P1] The post-climax process explanation slightly dilutes the last page.
- [P1] A late serial evidence-handoff rhythm still makes the middle feel over-explained.

## Sections to patch
- Chapter 4裁决后的解释段
- Chapter 5程序性收尾段

## Ship recommendation
- ship
`,
    'utf8',
  );

  await fs.writeFile(
    path.join(reviewJob.cardsDir, 'remix-depth-reviewer.md'),
    `---
reviewer: remix-depth-reviewer
verdict: pass
priority: P2
confidence: high
ship: ship
---

# Review card

## Strongest evidence
- the adaptation already feels fresh in its new format

## Top issues

## Sections to patch

## Ship recommendation
- ship
`,
    'utf8',
  );

  const revision = await createRevisionJob({
    draftPath: draft,
    reviewJobDir: reviewJob.jobDir,
    projectDir: root,
    focus: 'quality',
  });

  const manifest = JSON.parse(await fs.readFile(path.join(revision.jobDir, 'manifest.json'), 'utf8')) as {
    strategy?: string;
  };
  assert.equal(manifest.strategy, 'quality-patch');

  const writerPrompt = await fs.readFile(path.join(revision.promptsDir, '02-revision-writer.md'), 'utf8');
  assert.match(writerPrompt, /Prefer compression, reorder, and scene-surgery over rebuilding the whole machine/);
  assert.match(writerPrompt, /Compress procedural or explanatory aftercare after the real climax/);
  assert.match(writerPrompt, /Replace at least one serial evidence-handoff beat with resistance, misread, or cost/);
  assert.match(writerPrompt, /let reactions,裁决, or concrete consequence carry the force/);
});
