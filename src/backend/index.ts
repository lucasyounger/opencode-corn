import os from "node:os";
import { CronJob } from "../core/types.js";
import { LaunchdBackend } from "./launchd.js";
import { LinuxCronBackend } from "./linux-cron.js";
import { WindowsTaskSchedulerBackend } from "./windows-task-scheduler.js";

export interface SchedulerBackend {
  install(job: CronJob, runnerCommand: string): Promise<void>;
  remove(job: CronJob): Promise<void>;
}

export function createBackend(): SchedulerBackend {
  switch (os.platform()) {
    case "win32":
      return new WindowsTaskSchedulerBackend();
    case "darwin":
      return new LaunchdBackend();
    default:
      return new LinuxCronBackend();
  }
}
