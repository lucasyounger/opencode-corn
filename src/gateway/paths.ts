import path from "node:path";

export function getGatewayDir(rootDir: string): string {
  return path.join(rootDir, "gateway");
}

export function getGatewayRuntimePath(rootDir: string): string {
  return path.join(getGatewayDir(rootDir), "runtime.json");
}

export function getGatewayLockPath(rootDir: string): string {
  return path.join(getGatewayDir(rootDir), "gateway.lock.json");
}

export function getGatewayLogPath(rootDir: string): string {
  return path.join(getGatewayDir(rootDir), "gateway.log");
}
