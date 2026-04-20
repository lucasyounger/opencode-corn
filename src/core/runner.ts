import fs from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { CronJob, ExecutionResult, JobRunRecord, RunnerContext } from "./types.js";
import { buildOpencodeRunArgs, resolveSpawnSpec } from "./process.js";
import { renderPrompt } from "./prompt.js";
import { JobStore } from "../store/job-store.js";
import { acquireLock } from "../store/lock.js";
import { generateId } from "../utils/ids.js";
import { nowIso, computeNextRun } from "../utils/time.js";
import { deliverRun } from "./delivery.js";

const execFileAsync = promisify(execFile);

export async function runJob(context: RunnerContext, jobId: string): Promise<JobRunRecord> {
  const store = new JobStore(context.rootDir, context.scope);
  const job = await store.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const startedAt = nowIso();
  const lock = await acquireLock(store.getLockPath(job.id));
  if (!lock) {
    const skipped = buildRunRecord(job, context.scope, startedAt, {
      status: "skipped",
      output: "Skipped because another execution is already active.",
      reason: "overlap",
    });
    await store.appendRun(skipped);
    return skipped;
  }

  try {
    const result = await execute(job, context.command, context.environment);
    const record = buildRunRecord(job, context.scope, startedAt, result);
    job.lastRunAt = record.finishedAt;
    job.nextRunAt = computeNextRun(job.schedule, job.timezone);
    job.updatedAt = nowIso();
    if (result.sessionId) {
      job.sessionId = result.sessionId;
    }
    await Promise.all([
      fs.appendFile(store.getLogPath(job.id), `${record.finishedAt} ${result.output}\n`, "utf8"),
      store.appendRun(record),
      store.upsertJob(job),
      deliverRun(job, result),
    ]);
    return record;
  } finally {
    await lock.release();
  }
}

async function execute(
  job: CronJob,
  defaultCommand: string,
  environment?: Record<string, string>,
): Promise<ExecutionResult> {
  return job.mode === "attach" ? executeAttach(job) : executeCli(job, defaultCommand, environment);
}

async function executeCli(
  job: CronJob,
  defaultCommand: string,
  environment?: Record<string, string>,
): Promise<ExecutionResult> {
  const command = job.backend.command ?? defaultCommand;
  const args = buildOpencodeRunArgs(renderPrompt(job), {
    agent: job.agent,
    model: job.model,
  });
  const spawnSpec = resolveSpawnSpec(command, args);
  const child = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: job.workdir,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    void terminateChildProcess(child);
  }, job.timeoutSeconds * 1000);
  const [exitCode] = (await once(child, "close")) as [number | null];
  clearTimeout(timeoutHandle);

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

  if (timedOut) {
    return {
      status: "failed",
      output,
      exitCode: exitCode ?? -1,
      reason: "timeout",
    };
  }

  if (exitCode === 0) {
    return { status: "success", output, exitCode: 0 };
  }

  return {
    status: "failed",
    output,
    exitCode: exitCode ?? -1,
    reason: "cli-exit-nonzero",
  };
}

async function terminateChildProcess(child: ReturnType<typeof spawn>): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    child.kill("SIGTERM");
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
    }).catch(() => undefined);
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
}

async function executeAttach(job: CronJob): Promise<ExecutionResult> {
  if (!job.attachUrl) {
    throw new Error(`Job ${job.id} is in attach mode but missing attachUrl.`);
  }

  const client = createOpencodeClient({
    baseUrl: job.attachUrl,
    directory: job.workdir,
  });

  const sessionId = await resolveSessionId(client, job);
  const response = await client.session.prompt({
    path: { id: sessionId },
    query: { directory: job.workdir },
    body: {
      agent: job.agent,
      model: job.model,
      noReply: false,
      parts: [
        {
          type: "text",
          text: renderPrompt(job),
        },
      ],
      tools: {
        cronjob: false,
      },
    },
  });

  const data = response.data;
  const output = data ? data.parts.map((part) => JSON.stringify(part)).join("\n") : "";
  return {
    status: "success",
    output,
    sessionId,
  };
}

async function resolveSessionId(client: ReturnType<typeof createOpencodeClient>, job: CronJob): Promise<string> {
  if (job.sessionStrategy === "reuse" && job.sessionId) {
    return job.sessionId;
  }

  const response = await client.session.create({
    query: { directory: job.workdir },
    body: { title: `cron:${job.name}` },
  });
  const session = response.data;
  if (!session) {
    throw new Error("OpenCode SDK did not return a session.");
  }
  return session.id;
}

function buildRunRecord(job: CronJob, scope: string, startedAt: string, result: ExecutionResult): JobRunRecord {
  return {
    id: generateId("run"),
    jobId: job.id,
    scope,
    startedAt,
    finishedAt: nowIso(),
    status: result.status,
    exitCode: result.exitCode,
    reason: result.reason,
    outputPath: undefined,
    sessionId: result.sessionId,
  };
}
