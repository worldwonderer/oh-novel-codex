export type ReviewVerdict = 'pass' | 'mixed' | 'fail';
export type ReviewPriority = 'P0' | 'P1' | 'P2';
export type ReviewConfidence = 'low' | 'medium' | 'high';
export type ShipDecision = 'ship' | 'revise' | 'no-ship';

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

export type AggregatedReview = {
  overallVerdict: ReviewVerdict;
  overallShip: ShipDecision;
  qualityVerdict: ReviewVerdict;
  qualityShip: ShipDecision;
  originalityRisk: 'low' | 'medium' | 'high';
  reviewers: ReviewCard[];
  issuesByPriority: Record<ReviewPriority, string[]>;
  qualityIssuesByPriority: Record<ReviewPriority, string[]>;
  sectionsToPatch: string[];
  qualitySectionsToPatch: string[];
};
