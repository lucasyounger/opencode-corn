import { spawn } from "node:child_process";
import { readJsonFile } from "../store/fs.js";
import { getGatewayRuntimePath } from "./paths.js";
import { isGatewayRuntimeFresh } from "./runtime.js";
import { createGatewayServiceManager } from "./service-manager.js";
import { GatewayRuntimeState, GatewayServiceConfig } from "./types.js";

export async function ensureGatewayInfrastructure(config: GatewayServiceConfig): Promise<void> {
  const manager = createGatewayServiceManager();
  await manager.install(config);

  const runtime = await readJsonFile<GatewayRuntimeState>(getGatewayRuntimePath(config.rootDir));
  if (isGatewayRuntimeFresh(runtime, config.pollIntervalMs, new Date())) {
    return;
  }

  const child = spawn(
    config.gatewayCommand,
    [
      "serve",
      "--root",
      config.rootDir,
      "--command",
      config.defaultCommand,
      "--poll-ms",
      String(config.pollIntervalMs),
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
}
