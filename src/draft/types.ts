export type DraftMode = 'draft-longform' | 'zhihu-remix';
export type SourceOwnership = 'third-party' | 'self-owned';

export type DraftJobOptions = {
  brief?: string;
  briefPath?: string;
  sourcePath?: string;
  sourceOwnership?: SourceOwnership;
  projectDir?: string;
  jobName?: string;
  mode?: DraftMode;
  targetLength?: string;
  pov?: string;
  genre?: string;
};

export type DraftJob = {
  jobDir: string;
  promptsDir: string;
  outputsDir: string;
  handoffDir: string;
  manifestPath: string;
  projectDir: string;
};
