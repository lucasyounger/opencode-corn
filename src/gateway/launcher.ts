import { fileURLToPath } from "node:url";
import { GatewayServiceConfig } from "./types.js";

export interface GatewayLauncher {
  command: string;
  args: string[];
}

export function resolveGatewayLauncher(gatewayCommand: string): GatewayLauncher {
  if (process.platform === "win32" && gatewayCommand === "opencode-corn-gateway") {
    return {
      command: process.execPath,
      args: [fileURLToPath(new URL("../bin/gateway.js", import.meta.url))],
    };
  }

  return {
    command: gatewayCommand,
    args: [],
  };
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
