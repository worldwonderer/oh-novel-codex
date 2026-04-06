export type TeamLaneStatus = 'pending' | 'running' | 'completed' | 'failed';

export type TeamLane = {
  name: string;
  promptPath: string;
  logPath: string;
  lastMessagePath: string;
  status: TeamLaneStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type TeamJob = {
  jobDir: string;
  manifestPath: string;
  statePath: string;
  reviewJobDir: string;
  projectDir: string;
};
