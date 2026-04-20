import { spawn } from "node:child_process";
import { readJsonFile } from "../store/fs.js";
import { getGatewayRuntimePath } from "./paths.js";
import { buildGatewayServeArgs, resolveGatewayLauncher } from "./launcher.js";
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

  const launcher = resolveGatewayLauncher(config.gatewayCommand);
  const child = spawn(launcher.command, [...launcher.args, ...buildGatewayServeArgs(config)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}
