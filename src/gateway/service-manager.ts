import os from "node:os";
import { LaunchdGatewayServiceManager } from "./service/launchd.js";
import { LinuxSystemdGatewayServiceManager } from "./service/linux-systemd.js";
import { WindowsGatewayServiceManager } from "./service/windows.js";
import { GatewayServiceConfig } from "./types.js";

export interface GatewayServiceManager {
  install(config: GatewayServiceConfig): Promise<void>;
  uninstall(config: GatewayServiceConfig): Promise<void>;
}

export function createGatewayServiceManager(): GatewayServiceManager {
  switch (os.platform()) {
    case "win32":
      return new WindowsGatewayServiceManager();
    case "darwin":
      return new LaunchdGatewayServiceManager();
    default:
      return new LinuxSystemdGatewayServiceManager();
  }
}
