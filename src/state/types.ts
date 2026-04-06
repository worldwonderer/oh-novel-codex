export type OnxModeName = 'interview' | 'architect' | 'draft' | 'review' | 'revision' | 'workflow' | 'publish' | 'team';
export type OnxModeStatus = 'planned' | 'running' | 'completed' | 'failed' | 'idle';

export type OnxModeState = {
  mode: OnxModeName;
  active: boolean;
  status: OnxModeStatus;
  jobDir?: string;
  currentPhase?: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};
