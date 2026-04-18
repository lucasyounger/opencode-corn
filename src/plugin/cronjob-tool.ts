import { tool } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import { createBackend } from "../backend/index.js";
import { pluginOptionsSchema } from "../core/schema.js";
import { CronJob } from "../core/types.js";
import { JobStore } from "../store/job-store.js";
import { generateId } from "../utils/ids.js";
import { createScopeId, normalizeAbsolutePath } from "../utils/paths.js";
import { computeNextRun, nowIso } from "../utils/time.js";

const schema = tool.schema;

const argsSchema = {
  action: schema.enum(["create", "list", "get", "update", "pause", "resume", "run", "remove"]),
  id: schema.string().optional(),
  name: schema.string().optional(),
  prompt: schema.string().optional(),
  schedule: schema.string().optional(),
  timezone: schema.string().optional(),
  workdir: schema.string().optional(),
  mode: schema.enum(["cli", "attach"]).optional(),
  attachUrl: schema.string().url().optional(),
  sessionStrategy: schema.enum(["new", "reuse"]).optional(),
  sessionId: schema.string().optional(),
  agent: schema.string().optional(),
  providerID: schema.string().optional(),
  modelID: schema.string().optional(),
  skills: schema.array(schema.string()).optional(),
  timeoutSeconds: schema.number().int().positive().max(86400).optional(),
  webhookUrl: schema.string().url().optional(),
  failureWebhookUrl: schema.string().url().optional(),
};

export function createCronjobTool(options: unknown): ReturnType<typeof tool> {
  const parsedOptions = pluginOptionsSchema.parse(options);

  return tool({
    description: "Manage scheduled OpenCode jobs backed by OS-native schedulers.",
    args: argsSchema,
    async execute(args, context) {
      return handleAction(parsedOptions.rootDir, parsedOptions.defaultCommand, args, context);
    },
  });
}

async function handleAction(
  rootDir: string,
  defaultCommand: string,
  args: {
    action: "create" | "list" | "get" | "update" | "pause" | "resume" | "run" | "remove";
    id?: string;
    name?: string;
    prompt?: string;
    schedule?: string;
    timezone?: string;
    workdir?: string;
    mode?: "cli" | "attach";
    attachUrl?: string;
    sessionStrategy?: "new" | "reuse";
    sessionId?: string;
    agent?: string;
    providerID?: string;
    modelID?: string;
    skills?: string[];
    timeoutSeconds?: number;
    webhookUrl?: string;
    failureWebhookUrl?: string;
  },
  context: ToolContext,
): Promise<string> {
  const workdir = normalizeAbsolutePath(args.workdir ?? context.directory);
  const scope = createScopeId(workdir);
  const store = new JobStore(rootDir, scope);
  const backend = createBackend();
  await store.initialize();

  switch (args.action) {
    case "create": {
      const job = createJob(args, workdir);
      await store.upsertJob(job);
      await backend.install(job, defaultCommand);
      return JSON.stringify(job, null, 2);
    }
    case "list": {
      return JSON.stringify(await store.listJobs(), null, 2);
    }
    case "get": {
      requireId(args.id);
      return JSON.stringify((await store.getJob(args.id)) ?? null, null, 2);
    }
    case "update": {
      requireId(args.id);
      const existing = await loadExisting(store, args.id);
      const nextJob = {
        ...existing,
        ...patchJob(existing, args),
        updatedAt: nowIso(),
      };
      nextJob.nextRunAt = computeNextRun(nextJob.schedule, nextJob.timezone);
      await store.upsertJob(nextJob);
      if (nextJob.status === "enabled") {
        await backend.install(nextJob, defaultCommand);
      }
      return JSON.stringify(nextJob, null, 2);
    }
    case "pause": {
      requireId(args.id);
      const existing = await loadExisting(store, args.id);
      existing.status = "paused";
      existing.updatedAt = nowIso();
      await store.upsertJob(existing);
      await backend.remove(existing);
      return JSON.stringify(existing, null, 2);
    }
    case "resume": {
      requireId(args.id);
      const existing = await loadExisting(store, args.id);
      existing.status = "enabled";
      existing.updatedAt = nowIso();
      existing.nextRunAt = computeNextRun(existing.schedule, existing.timezone);
      await store.upsertJob(existing);
      await backend.install(existing, defaultCommand);
      return JSON.stringify(existing, null, 2);
    }
    case "run": {
      requireId(args.id);
      const runnerModule = await import("../core/runner.js");
      const record = await runnerModule.runJob(
        {
          rootDir,
          scope,
          command: defaultCommand,
        },
        args.id,
      );
      return JSON.stringify(record, null, 2);
    }
    case "remove": {
      requireId(args.id);
      const existing = await loadExisting(store, args.id);
      await backend.remove(existing);
      await store.deleteJob(existing.id);
      return JSON.stringify({ removed: existing.id }, null, 2);
    }
  }
}

function createJob(
  args: {
    name?: string;
    prompt?: string;
    schedule?: string;
    timezone?: string;
    mode?: "cli" | "attach";
    attachUrl?: string;
    sessionStrategy?: "new" | "reuse";
    sessionId?: string;
    agent?: string;
    providerID?: string;
    modelID?: string;
    skills?: string[];
    timeoutSeconds?: number;
    webhookUrl?: string;
    failureWebhookUrl?: string;
  },
  workdir: string,
): CronJob {
  if (!args.name || !args.prompt || !args.schedule) {
    throw new Error("create requires name, prompt, and schedule.");
  }

  const timezone = args.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const createdAt = nowIso();
  return {
    id: generateId("job"),
    name: args.name,
    prompt: args.prompt,
    schedule: args.schedule,
    timezone,
    workdir,
    status: "enabled",
    mode: args.mode ?? "cli",
    attachUrl: args.attachUrl,
    sessionStrategy: args.sessionStrategy ?? "new",
    sessionId: args.sessionId,
    agent: args.agent,
    model:
      args.providerID && args.modelID
        ? { providerID: args.providerID, modelID: args.modelID }
        : undefined,
    skills: args.skills ?? [],
    timeoutSeconds: args.timeoutSeconds ?? 1800,
    overlapPolicy: "skip",
    catchUpPolicy: "skip",
    delivery: {
      mode: args.webhookUrl || args.failureWebhookUrl ? "webhook" : "log",
      webhookUrl: args.webhookUrl,
      failureWebhookUrl: args.failureWebhookUrl,
    },
    backend: {
      kind: detectBackendKind(),
      command: undefined,
      extraArgs: [],
    },
    createdAt,
    updatedAt: createdAt,
    nextRunAt: computeNextRun(args.schedule, timezone),
  };
}

function patchJob(
  existing: CronJob,
  args: {
    name?: string;
    prompt?: string;
    schedule?: string;
    timezone?: string;
    workdir?: string;
    mode?: "cli" | "attach";
    attachUrl?: string;
    sessionStrategy?: "new" | "reuse";
    sessionId?: string;
    agent?: string;
    providerID?: string;
    modelID?: string;
    skills?: string[];
    timeoutSeconds?: number;
    webhookUrl?: string;
    failureWebhookUrl?: string;
  },
): Partial<CronJob> {
  const workdir = args.workdir ? normalizeAbsolutePath(args.workdir) : existing.workdir;
  return {
    name: args.name ?? existing.name,
    prompt: args.prompt ?? existing.prompt,
    schedule: args.schedule ?? existing.schedule,
    timezone: args.timezone ?? existing.timezone,
    workdir,
    mode: args.mode ?? existing.mode,
    attachUrl: args.attachUrl ?? existing.attachUrl,
    sessionStrategy: args.sessionStrategy ?? existing.sessionStrategy,
    sessionId: args.sessionId ?? existing.sessionId,
    agent: args.agent ?? existing.agent,
    model:
      args.providerID && args.modelID
        ? { providerID: args.providerID, modelID: args.modelID }
        : existing.model,
    skills: args.skills ?? existing.skills,
    timeoutSeconds: args.timeoutSeconds ?? existing.timeoutSeconds,
    delivery: {
      mode: args.webhookUrl || args.failureWebhookUrl || existing.delivery.mode === "webhook" ? "webhook" : "log",
      webhookUrl: args.webhookUrl ?? existing.delivery.webhookUrl,
      failureWebhookUrl: args.failureWebhookUrl ?? existing.delivery.failureWebhookUrl,
    },
  };
}

async function loadExisting(store: JobStore, id: string): Promise<CronJob> {
  const existing = await store.getJob(id);
  if (!existing) {
    throw new Error(`Job not found: ${id}`);
  }
  return existing;
}

function requireId(id: string | undefined): asserts id is string {
  if (!id) {
    throw new Error("action requires id.");
  }
}

function detectBackendKind(): CronJob["backend"]["kind"] {
  switch (process.platform) {
    case "win32":
      return "windows-task-scheduler";
    case "darwin":
      return "launchd";
    default:
      return "cron";
  }
}
