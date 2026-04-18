import { z } from "zod";

export const modelSchema = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
});

export const deliverySchema = z.object({
  mode: z.enum(["log", "webhook"]).default("log"),
  webhookUrl: z.string().url().optional(),
  failureWebhookUrl: z.string().url().optional(),
});

export const backendSchema = z.object({
  kind: z.enum(["gateway", "windows-task-scheduler", "launchd", "cron"]),
  command: z.string().min(1).optional(),
  extraArgs: z.array(z.string()).default([]),
});

export const jobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  schedule: z.string().min(1),
  timezone: z.string().min(1),
  workdir: z.string().min(1),
  status: z.enum(["enabled", "paused"]),
  mode: z.enum(["cli", "attach"]),
  attachUrl: z.string().url().optional(),
  sessionStrategy: z.enum(["new", "reuse"]).default("new"),
  sessionId: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  model: modelSchema.optional(),
  skills: z.array(z.string()).default([]),
  timeoutSeconds: z.number().int().positive().max(86400),
  overlapPolicy: z.literal("skip"),
  catchUpPolicy: z.literal("skip"),
  delivery: deliverySchema,
  backend: backendSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastRunAt: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
});

export const runRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  scope: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  exitCode: z.number().int().optional(),
  reason: z.string().optional(),
  outputPath: z.string().optional(),
  sessionId: z.string().optional(),
});

export const pluginOptionsSchema = z.object({
  rootDir: z.string().min(1).default("~/.config/opencode/cron"),
  defaultCommand: z.string().min(1).default("opencode"),
  gatewayCommand: z.string().min(1).default("opencode-corn-gateway"),
  gatewayPollIntervalMs: z.number().int().positive().max(3_600_000).default(30_000),
});
