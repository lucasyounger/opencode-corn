import fs from "node:fs/promises";
import path from "node:path";
import { CronJob, JobRunRecord, ScopedJob } from "../core/types.js";
import { jobSchema, runRecordSchema } from "../core/schema.js";
import { appendJsonLine, ensureDir, readJsonFile, removeFile, writeJsonFile } from "./fs.js";
import { createLegacyScopeId, createScopeId } from "../utils/paths.js";

export interface ResolvedJobStores {
  preferredScope: string;
  primaryStore: JobStore;
  stores: JobStore[];
}

export class JobStore {
  constructor(private readonly rootDir: string, readonly scope: string) {}

  private get scopeDir(): string {
    return path.join(this.rootDir, "scopes", this.scope);
  }

  private get jobsDir(): string {
    return path.join(this.scopeDir, "jobs");
  }

  private get runsDir(): string {
    return path.join(this.scopeDir, "runs");
  }

  private get locksDir(): string {
    return path.join(this.scopeDir, "locks");
  }

  private get logsDir(): string {
    return path.join(this.rootDir, "logs", this.scope);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      ensureDir(this.jobsDir),
      ensureDir(this.runsDir),
      ensureDir(this.locksDir),
      ensureDir(this.logsDir),
    ]);
  }

  async listJobs(): Promise<CronJob[]> {
    await this.initialize();
    const fs = await import("node:fs/promises");
    const entries = await fs.readdir(this.jobsDir);
    const jobs = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const value = await readJsonFile<unknown>(path.join(this.jobsDir, entry));
          return value ? jobSchema.parse(value) : undefined;
        }),
    );
    return jobs.filter((job): job is CronJob => job !== undefined);
  }

  async getJob(jobId: string): Promise<CronJob | undefined> {
    await this.initialize();
    const value = await readJsonFile<unknown>(this.getJobPath(jobId));
    return value ? jobSchema.parse(value) : undefined;
  }

  async upsertJob(job: CronJob): Promise<void> {
    await this.initialize();
    await writeJsonFile(this.getJobPath(job.id), jobSchema.parse(job));
  }

  async deleteJob(jobId: string): Promise<void> {
    await removeFile(this.getJobPath(jobId));
    await removeFile(this.getLockPath(jobId));
  }

  async appendRun(run: JobRunRecord): Promise<void> {
    await appendJsonLine(this.getRunPath(run.jobId), runRecordSchema.parse(run));
  }

  static async resolveStoresForWorkdir(rootDir: string, workdir: string): Promise<ResolvedJobStores> {
    const preferredScope = createScopeId(workdir);
    const legacyScope = createLegacyScopeId(workdir);

    await migrateLegacyScopeIfNeeded(rootDir, legacyScope, preferredScope);

    const primaryStore = new JobStore(rootDir, preferredScope);
    const stores = [primaryStore];
    if (legacyScope !== preferredScope && (await scopeExists(rootDir, legacyScope))) {
      stores.push(new JobStore(rootDir, legacyScope));
    }

    return {
      preferredScope,
      primaryStore,
      stores,
    };
  }

  static async listAllJobs(rootDir: string): Promise<ScopedJob[]> {
    const scopesRoot = path.join(rootDir, "scopes");

    try {
      const scopeEntries = await fs.readdir(scopesRoot, { withFileTypes: true });
      const jobsByScope = await Promise.all(
        scopeEntries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const scope = entry.name;
            const store = new JobStore(rootDir, scope);
            const jobs = await store.listJobs();
            return jobs.map((job) => ({ scope, job }));
          }),
      );

      return jobsByScope.flat();
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
  }

  getJobPath(jobId: string): string {
    return path.join(this.jobsDir, `${jobId}.json`);
  }

  getRunPath(jobId: string): string {
    return path.join(this.runsDir, `${jobId}.jsonl`);
  }

  getLockPath(jobId: string): string {
    return path.join(this.locksDir, `${jobId}.lock.json`);
  }

  getLogPath(jobId: string): string {
    return path.join(this.logsDir, `${jobId}.log`);
  }
}

async function migrateLegacyScopeIfNeeded(rootDir: string, legacyScope: string, preferredScope: string): Promise<void> {
  if (legacyScope === preferredScope) {
    return;
  }

  const legacyScopePath = getScopedRootPath(rootDir, "scopes", legacyScope);
  const preferredScopePath = getScopedRootPath(rootDir, "scopes", preferredScope);
  const legacyExists = await pathExists(legacyScopePath);
  const preferredExists = await pathExists(preferredScopePath);

  if (!legacyExists || preferredExists) {
    return;
  }

  await ensureDir(path.dirname(preferredScopePath));
  await fs.rename(legacyScopePath, preferredScopePath);

  const legacyLogsPath = getScopedRootPath(rootDir, "logs", legacyScope);
  const preferredLogsPath = getScopedRootPath(rootDir, "logs", preferredScope);
  if ((await pathExists(legacyLogsPath)) && !(await pathExists(preferredLogsPath))) {
    await ensureDir(path.dirname(preferredLogsPath));
    await fs.rename(legacyLogsPath, preferredLogsPath);
  }
}

function getScopedRootPath(rootDir: string, bucket: "logs" | "scopes", scope: string): string {
  return path.join(rootDir, bucket, scope);
}

async function scopeExists(rootDir: string, scope: string): Promise<boolean> {
  return pathExists(getScopedRootPath(rootDir, "scopes", scope));
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
