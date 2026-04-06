export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type PromptExecutionOptions = {
  promptPath: string;
  projectDir: string;
  logPath: string;
  lastMessagePath: string;
  codexCmd?: string;
  model?: string;
  profile?: string;
  sandbox?: SandboxMode;
  dryRun?: boolean;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  maxAttempts?: number;
  pollIntervalMs?: number;
};

export type RuntimeCompletionReason = 'dry-run' | 'process-exit' | 'artifact-complete';

export type RuntimeWatchTargetKind = 'markdown' | 'review-card' | 'draft' | 'last-message';

export type RuntimeWatchTarget = {
  kind: RuntimeWatchTargetKind;
  path: string;
  reviewer?: string;
};

export type PromptRuntimeTargetState = RuntimeWatchTarget & {
  exists: boolean;
  size: number;
  mtime?: string;
  changed: boolean;
};

export type PromptRuntimeStateStatus = 'idle' | 'running' | 'completed' | 'failed';

export type PromptRuntimeState = {
  status: PromptRuntimeStateStatus;
  attempt: number;
  maxAttempts: number;
  pid?: number;
  command: string[];
  logPath: string;
  lastMessagePath: string;
  runtimeStatePath: string;
  startedAt?: string;
  updatedAt: string;
  lastProgressAt?: string;
  lastStdoutAt?: string;
  lastArtifactAt?: string;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  completionReason?: RuntimeCompletionReason;
  error?: string;
  watchTargets: PromptRuntimeTargetState[];
};

export type PromptExecutionResult = {
  promptPath: string;
  logPath: string;
  lastMessagePath: string;
  dryRun: boolean;
  command: string[];
  attempts: number;
  completionReason?: RuntimeCompletionReason;
  runtimeStatePath?: string;
};

export type PromptExecutor = (options: PromptExecutionOptions) => Promise<PromptExecutionResult>;
