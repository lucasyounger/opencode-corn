import { tool } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import { parsePluginOptions } from "../core/schema.js";
import { CronJob } from "../core/types.js";
import { ensureGatewayInfrastructure } from "../gateway/control.js";
import { JobStore } from "../store/job-store.js";
import { generateId } from "../utils/ids.js";
import { normalizeAbsolutePath } from "../utils/paths.js";
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
  const parsedOptions = parsePluginOptions(options);
  const rootDir = normalizeAbsolutePath(parsedOptions.rootDir);

  return tool({
    description: "Manage scheduled OpenCode jobs executed by the resident cron gateway.",
    args: argsSchema,
    async execute(args, context) {
      return handleAction(
        {
          rootDir,
          defaultCommand: parsedOptions.defaultCommand,
          gatewayCommand: parsedOptions.gatewayCommand,
          gatewayPollIntervalMs: parsedOptions.gatewayPollIntervalMs,
        },
        args,
        context,
      );
    },
  });
}

async function handleAction(
  options: {
    rootDir: string;
    defaultCommand: string;
    gatewayCommand: string;
    gatewayPollIntervalMs: number;
  },
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
  const resolvedStores = await JobStore.resolveStoresForWorkdir(options.rootDir, workdir);
  await resolvedStores.primaryStore.initialize();

  switch (args.action) {
    case "create": {
      const job = createJob(args, workdir);
      await resolvedStores.primaryStore.upsertJob(job);
      await ensureGatewayInfrastructure({
        rootDir: options.rootDir,
        gatewayCommand: options.gatewayCommand,
        defaultCommand: options.defaultCommand,
        pollIntervalMs: options.gatewayPollIntervalMs,
      });
      return JSON.stringify(job, null, 2);
    }
    case "list": {
      return JSON.stringify(await listJobs(resolvedStores.stores), null, 2);
    }
    case "get": {
      requireId(args.id);
      return JSON.stringify((await findExistingEntry(resolvedStores.stores, args.id))?.job ?? null, null, 2);
    }
    case "update": {
      requireId(args.id);
      const existingEntry = await loadExisting(resolvedStores.stores, args.id);
      const existing = existingEntry.job;
      const nextJob = {
        ...existing,
        ...patchJob(existing, args),
        updatedAt: nowIso(),
      };
      nextJob.nextRunAt = computeNextRun(nextJob.schedule, nextJob.timezone);
      const targetStores = await JobStore.resolveStoresForWorkdir(options.rootDir, nextJob.workdir);
      await targetStores.primaryStore.upsertJob(nextJob);
      if (existingEntry.store.scope !== targetStores.primaryStore.scope) {
        await existingEntry.store.deleteJob(nextJob.id);
      }
      if (nextJob.status === "enabled") {
        await ensureGatewayInfrastructure({
          rootDir: options.rootDir,
          gatewayCommand: options.gatewayCommand,
          defaultCommand: options.defaultCommand,
          pollIntervalMs: options.gatewayPollIntervalMs,
        });
      }
      return JSON.stringify(nextJob, null, 2);
    }
    case "pause": {
      requireId(args.id);
      const existingEntry = await loadExisting(resolvedStores.stores, args.id);
      const existing = existingEntry.job;
      existing.status = "paused";
      existing.updatedAt = nowIso();
      await existingEntry.store.upsertJob(existing);
      return JSON.stringify(existing, null, 2);
    }
    case "resume": {
      requireId(args.id);
      const existingEntry = await loadExisting(resolvedStores.stores, args.id);
      const existing = existingEntry.job;
      existing.status = "enabled";
      existing.updatedAt = nowIso();
      existing.nextRunAt = computeNextRun(existing.schedule, existing.timezone);
      await existingEntry.store.upsertJob(existing);
      await ensureGatewayInfrastructure({
        rootDir: options.rootDir,
        gatewayCommand: options.gatewayCommand,
        defaultCommand: options.defaultCommand,
        pollIntervalMs: options.gatewayPollIntervalMs,
      });
      return JSON.stringify(existing, null, 2);
    }
    case "run": {
      requireId(args.id);
      const existingEntry = await loadExisting(resolvedStores.stores, args.id);
      const runnerModule = await import("../core/runner.js");
      const record = await runnerModule.runJob(
        {
          rootDir: options.rootDir,
          scope: existingEntry.store.scope,
          command: options.defaultCommand,
        },
        args.id,
      );
      return JSON.stringify(record, null, 2);
    }
    case "remove": {
      requireId(args.id);
      const existingEntry = await loadExisting(resolvedStores.stores, args.id);
      await existingEntry.store.deleteJob(existingEntry.job.id);
      const existing = existingEntry.job;
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
      kind: "gateway",
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

async function listJobs(stores: JobStore[]): Promise<CronJob[]> {
  const jobsByStore = await Promise.all(stores.map(async (store) => store.listJobs()));
  return jobsByStore.flat();
}

async function findExistingEntry(
  stores: JobStore[],
  id: string,
): Promise<{ store: JobStore; job: CronJob } | undefined> {
  for (const store of stores) {
    const existing = await store.getJob(id);
    if (existing) {
      return { store, job: existing };
    }
  }
  return undefined;
}

async function loadExisting(stores: JobStore[], id: string): Promise<{ store: JobStore; job: CronJob }> {
  const existing = await findExistingEntry(stores, id);
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
