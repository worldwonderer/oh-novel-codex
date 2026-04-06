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

test('renderAggregatedReviewMarkdown includes overall summary', () => {
  const aggregate = aggregateReviewCards([parseReviewCard(sampleCard)]);
  const markdown = renderAggregatedReviewMarkdown(aggregate);
  assert.match(markdown, /Overall verdict: \*\*fail\*\*/);
  assert.match(markdown, /Ship decision: \*\*no-ship\*\*/);
  assert.match(markdown, /Publish quality verdict:/);
  assert.match(markdown, /Originality risk:/);
  assert.match(markdown, /## P0 issues/);
});
