export type OnxEventKind =
  | 'draft.job.created'
  | 'review.job.created'
  | 'workflow.job.created'
  | 'team.job.created'
  | 'runtime.watchdog.recovered'
  | 'runtime.watchdog.nudged'
  | 'review.phase.started'
  | 'review.phase.completed'
  | 'review.phase.failed'
  | 'workflow.phase.started'
  | 'workflow.phase.completed'
  | 'workflow.phase.failed'
  | 'team.lane.started'
  | 'team.lane.completed'
  | 'team.lane.failed';

export type OnxRuntimeEvent = {
  timestamp: string;
  kind: OnxEventKind;
  projectDir: string;
  mode?: string;
  jobDir?: string;
  phase?: string;
  payload?: Record<string, unknown>;
};
