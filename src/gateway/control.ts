import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { readJsonFile } from "../store/fs.js";
import { getGatewayLogPath, getGatewayRuntimePath } from "./paths.js";
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
  const logPath = getGatewayLogPath(config.rootDir);
  await fsPromises.mkdir(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(launcher.command, [...launcher.args, ...buildGatewayServeArgs(config)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  let logFdClosed = false;
  const closeLogFd = () => {
    if (logFdClosed) {
      return;
    }
    fs.closeSync(logFd);
    logFdClosed = true;
  };
  child.on("error", (error) => {
    closeLogFd();
    void fsPromises.appendFile(
      logPath,
      `${new Date().toISOString()} bootstrap-error ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      "utf8",
    );
  });
  child.once("spawn", closeLogFd);
  child.unref();
}
