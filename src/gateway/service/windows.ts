import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildGatewayServeArgs, resolveGatewayLauncher } from "../launcher.js";
import type { GatewayServiceManager } from "../service-manager.js";
import { GatewayServiceConfig } from "../types.js";

const execFileAsync = promisify(execFile);
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE_NAME = "OpenCodeCornGateway";

export class WindowsGatewayServiceManager implements GatewayServiceManager {
  async install(config: GatewayServiceConfig): Promise<void> {
    await execFileAsync(
      "reg.exe",
      [
        "ADD",
        RUN_KEY,
        "/V",
        RUN_VALUE_NAME,
        "/F",
        "/T",
        "REG_SZ",
        "/D",
        buildWindowsGatewayAutostartCommand(config),
      ],
      { windowsHide: true },
    );
  }

  async uninstall(): Promise<void> {
    await execFileAsync("reg.exe", ["DELETE", RUN_KEY, "/V", RUN_VALUE_NAME, "/F"], {
      windowsHide: true,
    }).catch(() => undefined);
  }
}

export function buildWindowsGatewayAutostartCommand(config: GatewayServiceConfig): string {
  const launcher = resolveWindowsGatewayLauncher(config.gatewayCommand);
  return [
    ...launcher,
    ...buildGatewayServeArgs(config).map(quote),
  ].join(" ");
}

export function resolveWindowsGatewayLauncher(gatewayCommand: string): string[] {
  const launcher = resolveGatewayLauncher(gatewayCommand);
  return [quote(launcher.command), ...launcher.args.map(quote)];
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
