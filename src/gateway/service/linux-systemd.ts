import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GatewayServiceManager } from "../service-manager.js";
import { GatewayServiceConfig } from "../types.js";

const execFileAsync = promisify(execFile);

export class LinuxSystemdGatewayServiceManager implements GatewayServiceManager {
  async install(config: GatewayServiceConfig): Promise<void> {
    const unitPath = this.getUnitPath();
    await fs.mkdir(path.dirname(unitPath), { recursive: true });
    await fs.writeFile(unitPath, renderService(config), "utf8");
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    await execFileAsync("systemctl", ["--user", "enable", this.getUnitName()]);
    await execFileAsync("systemctl", ["--user", "restart", this.getUnitName()]);
  }

  async uninstall(): Promise<void> {
    await execFileAsync("systemctl", ["--user", "disable", "--now", this.getUnitName()]).catch(() => undefined);
    await fs.rm(this.getUnitPath(), { force: true }).catch(() => undefined);
    await execFileAsync("systemctl", ["--user", "daemon-reload"]).catch(() => undefined);
  }

  private getUnitName(): string {
    return "opencode-corn-gateway.service";
  }

  private getUnitPath(): string {
    return path.join(os.homedir(), ".config", "systemd", "user", this.getUnitName());
  }
}

function renderService(config: GatewayServiceConfig): string {
  return `[Unit]
Description=OpenCode Corn Gateway

[Service]
Type=simple
ExecStart=${[
  config.gatewayCommand,
  "serve",
  "--root",
  config.rootDir,
  "--command",
  config.defaultCommand,
  "--poll-ms",
  String(config.pollIntervalMs),
]
  .map(escapeSystemdArg)
  .join(" ")}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function escapeSystemdArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
