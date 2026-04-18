import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CronJob } from "../core/types.js";
import { createScopeId } from "../utils/paths.js";
import type { SchedulerBackend } from "./index.js";

const execFileAsync = promisify(execFile);

export class LaunchdBackend implements SchedulerBackend {
  async install(job: CronJob, runnerCommand: string): Promise<void> {
    const plistPath = this.getPlistPath(job);
    const programArgs = [runnerCommand, "run", "--scope", createScopeId(job.workdir), "--job", job.id];
    const plist = renderPlist(this.getLabel(job), programArgs, this.parseLaunchdSchedule(job.schedule));
    await fs.mkdir(path.dirname(plistPath), { recursive: true });
    await fs.writeFile(plistPath, plist, "utf8");
    await execFileAsync("launchctl", ["unload", plistPath]).catch(() => undefined);
    await execFileAsync("launchctl", ["load", plistPath]);
  }

  async remove(job: CronJob): Promise<void> {
    const plistPath = this.getPlistPath(job);
    await execFileAsync("launchctl", ["unload", plistPath]).catch(() => undefined);
    await fs.rm(plistPath, { force: true }).catch(() => undefined);
  }

  private getLabel(job: CronJob): string {
    return `ai.opencode.corn.${job.id}`;
  }

  private getPlistPath(job: CronJob): string {
    return path.join(os.homedir(), "Library", "LaunchAgents", `${this.getLabel(job)}.plist`);
  }

  private parseLaunchdSchedule(schedule: string): { minute: number; hour: number } {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error("launchd backend supports 5-field cron expressions only.");
    }
    return {
      minute: parts[0] === "*" ? 0 : Number(parts[0]),
      hour: parts[1] === "*" ? 0 : Number(parts[1]),
    };
  }
}

function renderPlist(label: string, programArgs: string[], schedule: { minute: number; hour: number }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${programArgs.map((value) => `      <string>${value}</string>`).join("\n")}
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Minute</key>
      <integer>${schedule.minute}</integer>
      <key>Hour</key>
      <integer>${schedule.hour}</integer>
    </dict>
  </dict>
</plist>
`;
}
