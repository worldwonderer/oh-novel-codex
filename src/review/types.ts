import type { SourceOwnership } from '../draft/types.js';

export type ReviewVerdict = 'pass' | 'mixed' | 'fail';
export type ReviewPriority = 'P0' | 'P1' | 'P2';
export type ReviewConfidence = 'low' | 'medium' | 'high';
export type ShipDecision = 'ship' | 'revise' | 'no-ship';
export type RepairLane = 'structure' | 'hook' | 'character' | 'ending' | 'pacing' | 'freshness';
export type RevisionStrategy = 'quality-patch' | 'structural-rebuild';
export type QualityDimension = 'hook' | 'character' | 'pacing' | 'ending' | 'originality' | 'continuity';
export type QualityScoreBand = 'strong' | 'watch' | 'weak';

export type ReviewIssue = {
  priority: ReviewPriority;
  text: string;
};

export type ReviewCard = {
  reviewer: string;
  verdict: ReviewVerdict;
  priority: ReviewPriority;
  confidence: ReviewConfidence;
  ship: ShipDecision;
  strongestEvidence: string[];
  issues: ReviewIssue[];
  sectionsToPatch: string[];
  shipRecommendation: string[];
  sourcePath?: string;
};

export type RepairRoute = {
  lane: RepairLane;
  score: number;
  reasons: string[];
};

export type QualityScore = {
  score: number;
  band: QualityScoreBand;
  reasons: string[];
};

export type QualityScorecard = Record<QualityDimension, QualityScore>;

export type PublishReadiness = {
  ready: boolean;
  failingDimensions: QualityDimension[];
  thresholds: Record<QualityDimension, number>;
};

export type AggregatedReview = {
  sourceOwnership: SourceOwnership;
  overallVerdict: ReviewVerdict;
  overallShip: ShipDecision;
  qualityVerdict: ReviewVerdict;
  qualityShip: ShipDecision;
  originalityRisk: 'low' | 'medium' | 'high';
  recommendedRevisionStrategy: RevisionStrategy;
  repairRoutes: RepairRoute[];
  reviewers: ReviewCard[];
  issuesByPriority: Record<ReviewPriority, string[]>;
  qualityIssuesByPriority: Record<ReviewPriority, string[]>;
  sectionsToPatch: string[];
  qualitySectionsToPatch: string[];
  qualityScorecard: QualityScorecard;
  publishReadiness: PublishReadiness;
  compositeScore: number;
};
