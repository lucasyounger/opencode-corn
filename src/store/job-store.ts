import path from "node:path";
import { CronJob, JobRunRecord, ScopedJob } from "../core/types.js";
import { jobSchema, runRecordSchema } from "../core/schema.js";
import { appendJsonLine, ensureDir, readJsonFile, removeFile, writeJsonFile } from "./fs.js";

export class JobStore {
  constructor(private readonly rootDir: string, private readonly scope: string) {}

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

  static async listAllJobs(rootDir: string): Promise<ScopedJob[]> {
    const fs = await import("node:fs/promises");
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

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
