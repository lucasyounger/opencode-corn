export type JobMode = "cli" | "attach";
export type SessionStrategy = "new" | "reuse";
export type OverlapPolicy = "skip";
export type CatchUpPolicy = "skip";
export type DeliveryMode = "log" | "webhook";
export type JobStatus = "enabled" | "paused";
export type RunStatus = "success" | "failed" | "skipped";
export type BackendKind = "gateway" | "windows-task-scheduler" | "launchd" | "cron";

export interface DeliveryConfig {
  mode: DeliveryMode;
  webhookUrl?: string;
  failureWebhookUrl?: string;
}

export interface JobModelRef {
  providerID: string;
  modelID: string;
}

export interface SchedulerBackendSettings {
  kind: BackendKind;
  command?: string;
  extraArgs: string[];
}

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  timezone: string;
  workdir: string;
  status: JobStatus;
  mode: JobMode;
  attachUrl?: string;
  sessionStrategy: SessionStrategy;
  sessionId?: string;
  agent?: string;
  model?: JobModelRef;
  skills: string[];
  timeoutSeconds: number;
  overlapPolicy: OverlapPolicy;
  catchUpPolicy: CatchUpPolicy;
  delivery: DeliveryConfig;
  backend: SchedulerBackendSettings;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface JobRunRecord {
  id: string;
  jobId: string;
  scope: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  exitCode?: number;
  reason?: string;
  outputPath?: string;
  sessionId?: string;
}

export interface ExecutionResult {
  status: RunStatus;
  reason?: string;
  output: string;
  exitCode?: number;
  sessionId?: string;
}

export interface RunnerContext {
  rootDir: string;
  scope: string;
  command: string;
  environment?: Record<string, string>;
}

export interface ScopedJob {
  scope: string;
  job: CronJob;
}
