import os from "node:os";
import { runJob } from "../core/runner.js";
import { CronJob, ScopedJob } from "../core/types.js";
import { acquireLock, LockHandle } from "../store/lock.js";
import { writeJsonFile } from "../store/fs.js";
import { JobStore } from "../store/job-store.js";
import { nowIso } from "../utils/time.js";
import { getGatewayLockPath, getGatewayRuntimePath } from "./paths.js";
import { GatewayRuntimeState } from "./types.js";

const DEFAULT_HEARTBEAT_GRACE_MS = 60_000;

export interface GatewayRuntimeOptions {
  rootDir: string;
  defaultCommand: string;
  pollIntervalMs: number;
  environment?: Record<string, string>;
  now?: () => Date;
}

export function isJobDue(job: CronJob, currentDate: Date): boolean {
  if (job.status !== "enabled") {
    return false;
  }
  if (!job.nextRunAt) {
    return true;
  }
  return new Date(job.nextRunAt).getTime() <= currentDate.getTime();
}

export function selectDueJobs(entries: ScopedJob[], currentDate: Date): ScopedJob[] {
  return entries.filter((entry) => isJobDue(entry.job, currentDate));
}

export function isGatewayRuntimeFresh(
  state: GatewayRuntimeState | undefined,
  pollIntervalMs: number,
  currentDate: Date,
): boolean {
  if (!state) {
    return false;
  }
  const heartbeatAt = new Date(state.updatedAt).getTime();
  const maxAgeMs = Math.max(pollIntervalMs * 2, DEFAULT_HEARTBEAT_GRACE_MS);
  return Number.isFinite(heartbeatAt) && currentDate.getTime() - heartbeatAt <= maxAgeMs;
}

export class GatewayRuntime {
  private readonly inFlight = new Set<string>();
  private readonly now: () => Date;
  private startedAt = "";

  constructor(private readonly options: GatewayRuntimeOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async start(signal?: AbortSignal): Promise<void> {
    const lock = await this.acquireGatewayLock();
    this.startedAt = nowIso();

    try {
      while (!signal?.aborted) {
        await this.tick();
        await sleep(this.options.pollIntervalMs, signal);
      }
    } finally {
      await this.writeRuntimeState();
      await lock.release();
    }
  }

  async tick(): Promise<void> {
    const entries = await JobStore.listAllJobs(this.options.rootDir);
    const dueJobs = selectDueJobs(entries, this.now());
    await this.writeRuntimeState();

    for (const entry of dueJobs) {
      if (this.inFlight.has(entry.job.id)) {
        continue;
      }
      this.inFlight.add(entry.job.id);
      void this.runDueJob(entry).finally(async () => {
        this.inFlight.delete(entry.job.id);
        await this.writeRuntimeState();
      });
    }
  }

  private async runDueJob(entry: ScopedJob): Promise<void> {
    await runJob(
      {
        rootDir: this.options.rootDir,
        scope: entry.scope,
        command: this.options.defaultCommand,
        environment: this.options.environment,
      },
      entry.job.id,
    );
  }

  private async acquireGatewayLock(): Promise<LockHandle> {
    const lock = await acquireLock(getGatewayLockPath(this.options.rootDir));
    if (!lock) {
      throw new Error("Gateway is already running.");
    }
    return lock;
  }

  private async writeRuntimeState(): Promise<void> {
    await writeJsonFile(getGatewayRuntimePath(this.options.rootDir), {
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: this.startedAt || nowIso(),
      updatedAt: nowIso(),
      pollIntervalMs: this.options.pollIntervalMs,
      activeJobIds: [...this.inFlight],
    } satisfies GatewayRuntimeState);
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
