import { fileURLToPath } from "node:url";
import path from "node:path";
import { GatewayServiceConfig } from "./types.js";

export interface GatewayLauncher {
  command: string;
  args: string[];
}

export function resolveGatewayLauncher(gatewayCommand: string): GatewayLauncher {
  if (process.platform === "win32" && gatewayCommand === "opencode-cron-gateway") {
    const nodeCommand = resolveWindowsNodeCommand();
    if (nodeCommand) {
      return {
        command: nodeCommand,
        args: [fileURLToPath(new URL("../bin/gateway.js", import.meta.url))],
      };
    }

    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", gatewayCommand],
    };
  }

  return {
    command: gatewayCommand,
    args: [],
  };
}

function resolveWindowsNodeCommand(): string | undefined {
  const executable = path.basename(process.execPath).toLowerCase();
  return executable === "node.exe" || executable === "node" ? process.execPath : undefined;
}

export function buildGatewayServeArgs(config: GatewayServiceConfig): string[] {
  return [
    "serve",
    "--root",
    config.rootDir,
    "--command",
    config.defaultCommand,
    "--poll-ms",
    String(config.pollIntervalMs),
  ];
}
