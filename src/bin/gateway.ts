#!/usr/bin/env node
import { createGatewayServiceManager } from "../gateway/service-manager.js";
import { getGatewayRuntimePath } from "../gateway/paths.js";
import { GatewayRuntime } from "../gateway/runtime.js";
import { pluginOptionsSchema } from "../core/schema.js";
import { readJsonFile } from "../store/fs.js";
import { normalizeAbsolutePath } from "../utils/paths.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "serve":
      await serve(args);
      return;
    case "install-service":
      await createGatewayServiceManager().install(readConfig(args));
      return;
    case "uninstall-service":
      await createGatewayServiceManager().uninstall(readConfig(args));
      return;
    case "status": {
      const config = readConfig(args);
      const state = await readJsonFile(getGatewayRuntimePath(config.rootDir));
      process.stdout.write(`${JSON.stringify(state ?? null, null, 2)}\n`);
      return;
    }
    default:
      throw new Error(
        "Usage: opencode-corn-gateway <serve|install-service|uninstall-service|status> [--root <dir>] [--command <cmd>] [--gateway-command <cmd>] [--poll-ms <ms>]",
      );
  }
}

async function serve(args: string[]): Promise<void> {
  const config = readConfig(args);
  const runtime = new GatewayRuntime({
    rootDir: config.rootDir,
    defaultCommand: config.defaultCommand,
    pollIntervalMs: config.pollIntervalMs,
  });

  const controller = new AbortController();
  for (const event of ["SIGINT", "SIGTERM"] as const) {
    process.on(event, () => controller.abort());
  }

  await runtime.start(controller.signal);
}

function readConfig(args: string[]) {
  const defaults = pluginOptionsSchema.parse({});
  return {
    rootDir: normalizeAbsolutePath(readOptionalFlag(args, "--root") ?? defaults.rootDir),
    defaultCommand: readOptionalFlag(args, "--command") ?? defaults.defaultCommand,
    gatewayCommand: readOptionalFlag(args, "--gateway-command") ?? defaults.gatewayCommand,
    pollIntervalMs: Number(readOptionalFlag(args, "--poll-ms") ?? defaults.gatewayPollIntervalMs),
  };
}

function readOptionalFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
