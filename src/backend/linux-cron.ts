import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CronJob } from "../core/types.js";
import { createScopeId, ensureTrailingNewline } from "../utils/paths.js";
import type { SchedulerBackend } from "./index.js";

export class LinuxCronBackend implements SchedulerBackend {
  async install(job: CronJob, runnerCommand: string): Promise<void> {
    const line = `${job.schedule} ${runnerCommand} run --scope ${createScopeId(job.workdir)} --job ${job.id} # ${this.getMarker(job)}`;
    const cronFile = this.getCronFilePath();
    const existing = await readMaybe(cronFile);
    const withoutPrevious = existing
      .split(/\r?\n/)
      .filter((entry) => !entry.includes(this.getMarker(job)) && entry.trim().length > 0);
    withoutPrevious.push(line);
    await fs.mkdir(path.dirname(cronFile), { recursive: true });
    await fs.writeFile(cronFile, ensureTrailingNewline(withoutPrevious.join("\n")), "utf8");
  }

  async remove(job: CronJob): Promise<void> {
    const cronFile = this.getCronFilePath();
    const existing = await readMaybe(cronFile);
    const nextContent = existing
      .split(/\r?\n/)
      .filter((entry) => !entry.includes(this.getMarker(job)) && entry.trim().length > 0)
      .join("\n");
    await fs.writeFile(cronFile, ensureTrailingNewline(nextContent), "utf8");
  }

  private getMarker(job: CronJob): string {
    return `opencode-cron:${job.id}`;
  }

  private getCronFilePath(): string {
    return path.join(os.homedir(), ".config", "opencode-cron", "cron.tab");
  }
}

async function readMaybe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "";
    }
    throw error;
  }
}
