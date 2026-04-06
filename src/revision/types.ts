export type RevisionFocus = 'quality' | 'all' | 'originality';

export type RevisionJobOptions = {
  draftPath: string;
  reviewJobDir: string;
  projectDir?: string;
  jobName?: string;
  focus?: RevisionFocus;
};

export type RevisionJob = {
  jobDir: string;
  promptsDir: string;
  outputsDir: string;
  handoffDir: string;
  manifestPath: string;
};
