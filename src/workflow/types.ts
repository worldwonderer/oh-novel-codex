import type { DraftJob } from '../draft/types.js';
import type { RevisionFocus } from '../revision/types.js';
import type { ReviewJob } from '../review/runner.js';
import type { PublishReadiness, QualityDimension, QualityScorecard, RevisionStrategy } from '../review/types.js';
import type { WorkflowState } from './state.js';
import type { SourceOwnership } from '../draft/types.js';

export type WorkflowJobOptions = {
  brief?: string;
  briefPath?: string;
  sourcePath?: string;
  sourceOwnership?: SourceOwnership;
  projectDir?: string;
  jobName?: string;
  mode?: 'draft-longform' | 'zhihu-remix';
  targetLength?: string;
  pov?: string;
  genre?: string;
  reviewers?: string[];
  publishThresholds?: Partial<Record<QualityDimension, number>>;
};

export type WorkflowJob = {
  jobDir: string;
  manifestPath: string;
  runbookPath: string;
  statePath: string;
  draftJob: DraftJob;
  reviewJob: ReviewJob;
  state: WorkflowState;
};

export type WorkflowIteration = {
  stage: 'initial' | 'revision';
  draftPath: string;
  reviewJobDir: string;
  aggregatePath?: string;
  revisionJobDir?: string;
  revisionFocus?: RevisionFocus;
  revisionStrategy?: RevisionStrategy;
  postReviewRecommendedStrategy?: RevisionStrategy;
  compositeScore?: number;
  publishReadiness?: PublishReadiness;
  qualityScorecard?: QualityScorecard;
};
