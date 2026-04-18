import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GatewayServiceManager } from "../service-manager.js";
import { GatewayServiceConfig } from "../types.js";

const execFileAsync = promisify(execFile);

export class WindowsGatewayServiceManager implements GatewayServiceManager {
  async install(config: GatewayServiceConfig): Promise<void> {
    await execFileAsync(
      "schtasks.exe",
      [
        "/Create",
        "/F",
        "/SC",
        "ONLOGON",
        "/TN",
        this.getTaskName(),
        "/TR",
        this.renderTaskCommand(config),
      ],
      { windowsHide: true },
    );
  }

  async uninstall(): Promise<void> {
    await execFileAsync("schtasks.exe", ["/Delete", "/F", "/TN", this.getTaskName()], {
      windowsHide: true,
    }).catch(() => undefined);
  }

  private getTaskName(): string {
    return "\\OpenCodeCorn\\Gateway";
  }

  private renderTaskCommand(config: GatewayServiceConfig): string {
    return [
      quote(config.gatewayCommand),
      "serve",
      "--root",
      quote(config.rootDir),
      "--command",
      quote(config.defaultCommand),
      "--poll-ms",
      String(config.pollIntervalMs),
    ].join(" ");
  }
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
