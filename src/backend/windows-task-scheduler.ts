import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CronJob } from "../core/types.js";
import { createScopeId } from "../utils/paths.js";
import type { SchedulerBackend } from "./index.js";

const execFileAsync = promisify(execFile);

export class WindowsTaskSchedulerBackend implements SchedulerBackend {
  async install(job: CronJob, runnerCommand: string): Promise<void> {
    const taskName = this.getTaskName(job);
    const interval = cronToWindowsMinutes(job.schedule);
    const args = [
      "/Create",
      "/F",
      "/SC",
      "MINUTE",
      "/MO",
      String(interval),
      "/TN",
      taskName,
      "/TR",
      `"${runnerCommand}" run --scope ${createScopeId(job.workdir)} --job ${job.id}`,
    ];
    await execFileAsync("schtasks.exe", args, { windowsHide: true });
  }

  async remove(job: CronJob): Promise<void> {
    await execFileAsync("schtasks.exe", ["/Delete", "/F", "/TN", this.getTaskName(job)], {
      windowsHide: true,
    }).catch(() => undefined);
  }

  private getTaskName(job: CronJob): string {
    return `\\OpenCodeCorn\\${job.name}-${job.id}`;
  }
}

function cronToWindowsMinutes(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Windows backend currently supports standard 5-field cron expressions only.");
  }
  const minutePart = parts[0];
  const hourPart = parts[1];
  if (minutePart && hourPart && minutePart.startsWith("*/") && hourPart === "*") {
    return Number(minutePart.slice(2));
  }
  return 60;
}
