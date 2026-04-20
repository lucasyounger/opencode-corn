import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GatewayServiceManager } from "../service-manager.js";
import { GatewayServiceConfig } from "../types.js";

const execFileAsync = promisify(execFile);

export class LaunchdGatewayServiceManager implements GatewayServiceManager {
  async install(config: GatewayServiceConfig): Promise<void> {
    const plistPath = this.getPlistPath();
    const plist = renderPlist(this.getLabel(), [
      config.gatewayCommand,
      "serve",
      "--root",
      config.rootDir,
      "--command",
      config.defaultCommand,
      "--poll-ms",
      String(config.pollIntervalMs),
    ]);

    await fs.mkdir(path.dirname(plistPath), { recursive: true });
    await fs.writeFile(plistPath, plist, "utf8");
    await execFileAsync("launchctl", ["unload", plistPath]).catch(() => undefined);
    await execFileAsync("launchctl", ["load", plistPath]);
  }

  async uninstall(): Promise<void> {
    const plistPath = this.getPlistPath();
    await execFileAsync("launchctl", ["unload", plistPath]).catch(() => undefined);
    await fs.rm(plistPath, { force: true }).catch(() => undefined);
  }

  private getLabel(): string {
    return "ai.opencode.cron.gateway";
  }

  private getPlistPath(): string {
    return path.join(os.homedir(), "Library", "LaunchAgents", `${this.getLabel()}.plist`);
  }
}

function renderPlist(label: string, programArgs: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${programArgs.map((value) => `      <string>${escapeXml(value)}</string>`).join("\n")}
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
