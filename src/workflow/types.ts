import type { DraftJob } from '../draft/types.js';
import type { ReviewJob } from '../review/runner.js';
import type { WorkflowState } from './state.js';

export type WorkflowJobOptions = {
  brief?: string;
  briefPath?: string;
  sourcePath?: string;
  projectDir?: string;
  jobName?: string;
  mode?: 'draft-longform' | 'zhihu-remix';
  targetLength?: string;
  pov?: string;
  genre?: string;
  reviewers?: string[];
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
};
