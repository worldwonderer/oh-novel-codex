import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReviewCards, parseReviewCard, renderAggregatedReviewMarkdown } from '../aggregate.js';

const sampleCard = `---
reviewer: hook-doctor
verdict: fail
priority: P0
confidence: high
ship: no-ship
---

# Review card

## Strongest evidence
- opening starts with explanation instead of anomaly

## Top issues
- [P0] first paragraph lacks a real hook
- [P1] chapter 2 opens too softly

## Sections to patch
- opening scene
- chapter 2 beat 1

## Ship recommendation
- no-ship
`;

test('parseReviewCard parses frontmatter and sections', () => {
  const card = parseReviewCard(sampleCard, 'hook.md');
  assert.equal(card.reviewer, 'hook-doctor');
  assert.equal(card.verdict, 'fail');
  assert.equal(card.priority, 'P0');
  assert.equal(card.confidence, 'high');
  assert.equal(card.ship, 'no-ship');
  assert.equal(card.issues.length, 2);
  assert.equal(card.issues[0].priority, 'P0');
  assert.equal(card.sectionsToPatch[0], 'opening scene');
});

test('aggregateReviewCards merges severity and ship decision', () => {
  const hook = parseReviewCard(sampleCard, 'hook.md');
  const ending = parseReviewCard(
    sampleCard
      .replace('hook-doctor', 'ending-killshot-reviewer')
      .replace('fail', 'mixed')
      .replace('P0', 'P1')
      .replace('no-ship', 'revise')
      .replace('first paragraph lacks a real hook', 'ending lacks a final strike')
      .replace('opening scene', 'last scene'),
    'ending.md',
  );

  const aggregate = aggregateReviewCards([hook, ending]);
  assert.equal(aggregate.overallVerdict, 'fail');
  assert.equal(aggregate.overallShip, 'no-ship');
  assert.equal(aggregate.qualityVerdict, 'fail');
  assert.equal(aggregate.qualityShip, 'no-ship');
  assert.equal(aggregate.originalityRisk, 'low');
  assert.equal(aggregate.publishReadiness.ready, false);
  assert.ok(aggregate.qualityScorecard.hook.score < 70);
  assert.ok(aggregate.issuesByPriority.P0.includes('first paragraph lacks a real hook'));
  assert.ok(aggregate.sectionsToPatch.includes('last scene'));
});

test('aggregateReviewCards separates originality risk from quality gate', () => {
  const quality = parseReviewCard(sampleCard, 'hook.md');
  const originality = parseReviewCard(
    sampleCard
      .replace('hook-doctor', 'remix-depth-reviewer')
      .replace('first paragraph lacks a real hook', 'beat order stays too close to source')
      .replace('opening scene', 'chapter skeleton'),
    'remix.md',
  );

  const aggregate = aggregateReviewCards([quality, originality]);
  assert.equal(aggregate.originalityRisk, 'high');
  assert.ok(aggregate.qualityIssuesByPriority.P0.includes('first paragraph lacks a real hook'));
  assert.ok(!aggregate.qualityIssuesByPriority.P0.includes('beat order stays too close to source'));
});

test('aggregateReviewCards recommends structural rebuild when structure failures dominate', () => {
  const structure = parseReviewCard(`---
reviewer: publish-gate-reviewer
verdict: mixed
priority: P1
confidence: high
ship: revise
---

# Review card

## Strongest evidence
- the middle still spends too many scenes repeating the same explanation function

## Top issues
- [P1] The main beat ladder still shadows the source too neatly.
- [P1] Chapter 5 sits in the same begging-after-loss slot and burns ending acceleration.

## Sections to patch
- Chapter 1 opener discovery engine
- Chapter 5 interception and ending landing

## Ship recommendation
- revise
`, 'publish.md');

  const aggregate = aggregateReviewCards([structure]);
  assert.equal(aggregate.recommendedRevisionStrategy, 'structural-rebuild');
  assert.equal(aggregate.repairRoutes[0]?.lane, 'structure');
  assert.ok(aggregate.repairRoutes.some((route) => route.lane === 'ending'));
});

test('aggregateReviewCards downshifts to quality patch when pacing and ending dominate a self-owned draft', () => {
  const ending = parseReviewCard(`---
reviewer: ending-killshot-reviewer
verdict: mixed
priority: P1
confidence: high
ship: revise
---

# Review card

## Strongest evidence
- the true climax already landed before chapter 5’s procedural cleanup

## Top issues
- [P1] Chapter 5 spends too much voltage on recovery procedure after the real climax.
- [P1] The final line states the theme too directly instead of leaving a harder aftertaste.

## Sections to patch
- Chapter 5 from the first核验 scene to the final line

## Ship recommendation
- revise
`, 'ending.md');

  const gate = parseReviewCard(`---
reviewer: publish-gate-reviewer
verdict: mixed
priority: P1
confidence: high
ship: ship
---

# Review card

## Strongest evidence
- the rewrite has its own corporate-compliance machine and freshness is already good enough

## Top issues
- [P1] The post-climax process explanation slightly dilutes the last page.
- [P1] A late serial evidence-handoff rhythm still makes the middle feel over-explained.

## Sections to patch
- Chapter 4裁决后的解释段
- Chapter 5程序性收尾段

## Ship recommendation
- ship
`, 'gate.md');

  const remix = parseReviewCard(`---
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
`, 'remix.md');

  const aggregate = aggregateReviewCards([ending, gate, remix], { sourceOwnership: 'self-owned' });
  assert.equal(aggregate.recommendedRevisionStrategy, 'quality-patch');
  assert.equal(aggregate.repairRoutes[0]?.lane, 'pacing');
  assert.ok(aggregate.repairRoutes.some((route) => route.lane === 'ending'));
});

test('aggregateReviewCards does not let remix-depth gate self-owned adaptations', () => {
  const quality = parseReviewCard(`---
reviewer: hook-doctor
verdict: pass
priority: P2
confidence: high
ship: ship
---

# Review card

## Strongest evidence
- opening is already ship-safe

## Top issues

## Sections to patch

## Ship recommendation
- ship
`, 'hook.md');
  const originality = parseReviewCard(
    sampleCard
      .replace('hook-doctor', 'remix-depth-reviewer')
      .replace('first paragraph lacks a real hook', 'skeleton still feels too source-shaped')
      .replace('opening scene', 'core skeleton'),
    'remix.md',
  );

  const aggregate = aggregateReviewCards([quality, originality], { sourceOwnership: 'self-owned' });
  assert.equal(aggregate.sourceOwnership, 'self-owned');
  assert.equal(aggregate.overallShip, 'ship');
  assert.equal(aggregate.overallVerdict, 'pass');
  assert.equal(aggregate.originalityRisk, 'high');
  assert.equal(aggregate.publishReadiness.ready, true);

  const markdown = renderAggregatedReviewMarkdown(aggregate);
  assert.match(markdown, /Adaptation freshness risk:/);
});

test('aggregateReviewCards renders quality scorecard and publish readiness summary', () => {
  const aggregate = aggregateReviewCards([parseReviewCard(sampleCard)]);
  assert.ok(aggregate.compositeScore >= 0 && aggregate.compositeScore <= 100);
  assert.ok(aggregate.publishReadiness.failingDimensions.includes('hook'));
  assert.equal(aggregate.qualityScorecard.originality.band, 'strong');

  const markdown = renderAggregatedReviewMarkdown(aggregate);
  assert.match(markdown, /## Quality scorecard/);
  assert.match(markdown, /## Publish readiness/);
});

test('renderAggregatedReviewMarkdown includes overall summary', () => {
  const aggregate = aggregateReviewCards([parseReviewCard(sampleCard)]);
  const markdown = renderAggregatedReviewMarkdown(aggregate);
  assert.match(markdown, /Overall verdict: \*\*fail\*\*/);
  assert.match(markdown, /Ship decision: \*\*no-ship\*\*/);
  assert.match(markdown, /Publish quality verdict:/);
  assert.match(markdown, /Originality risk:/);
  assert.match(markdown, /Recommended revision strategy:/);
  assert.match(markdown, /## Repair routing/);
  assert.match(markdown, /## P0 issues/);
});
