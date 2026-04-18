export interface GatewayRuntimeState {
  pid: number;
  hostname: string;
  startedAt: string;
  updatedAt: string;
  pollIntervalMs: number;
  activeJobIds: string[];
}

export interface GatewayServiceConfig {
  rootDir: string;
  gatewayCommand: string;
  defaultCommand: string;
  pollIntervalMs: number;
}
