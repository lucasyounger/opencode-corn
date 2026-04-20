import test from "node:test";
import assert from "node:assert/strict";
import { buildWindowsGatewayAutostartCommand, resolveWindowsGatewayLauncher } from "../src/gateway/service/windows.js";
import { buildGatewayServeArgs, resolveGatewayLauncher } from "../src/gateway/launcher.js";

test("resolveWindowsGatewayLauncher uses node plus bundled gateway entry for default command", () => {
  const launcher = resolveWindowsGatewayLauncher("opencode-cron-gateway");

  assert.equal(launcher.length, 2);
  assert.equal(launcher[0], `"${process.execPath}"`);
  const scriptEntry = launcher[1];
  assert.ok(scriptEntry);
  assert.match(scriptEntry, /dist[\\/]+src[\\/]+bin[\\/]+gateway\.js"$/);
});

test("buildWindowsGatewayAutostartCommand renders a fully quoted command line", () => {
  const command = buildWindowsGatewayAutostartCommand({
    rootDir: "C:\\Users\\Lucas\\.config\\opencode\\cron",
    gatewayCommand: "opencode-cron-gateway",
    defaultCommand: "opencode",
    pollIntervalMs: 30_000,
  });

  assert.match(command, new RegExp(`^"${escapeRegExp(process.execPath)}"`));
  assert.match(command, /"[^"]*dist[\\/]+src[\\/]+bin[\\/]+gateway\.js" "serve" /);
  assert.ok(command.includes('"--root" "C:\\Users\\Lucas\\.config\\opencode\\cron"'));
  assert.ok(command.includes('"--command" "opencode"'));
  assert.ok(command.endsWith('"--poll-ms" "30000"'));
});

test("buildWindowsGatewayAutostartCommand falls back to cmd wrapper when process.execPath is not node", () => {
  const originalExecPath = process.execPath;
  Object.defineProperty(process, "execPath", {
    value: "C:\\Tools\\opencode.exe",
    configurable: true,
  });

  try {
    const command = buildWindowsGatewayAutostartCommand({
      rootDir: "C:\\Users\\Lucas\\.config\\opencode\\cron",
      gatewayCommand: "opencode-cron-gateway",
      defaultCommand: "opencode",
      pollIntervalMs: 30_000,
    });

    assert.match(command, new RegExp(`^"${escapeRegExp(process.env.ComSpec ?? "cmd.exe")}"`));
    assert.match(command, /"\/d" "\/s" "\/c" "opencode-cron-gateway" "serve" /);
  } finally {
    Object.defineProperty(process, "execPath", {
      value: originalExecPath,
      configurable: true,
    });
  }
});

test("resolveGatewayLauncher uses node plus bundled gateway entry on Windows default command", () => {
  const originalPlatform = process.platform;
  Object.defineProperty(process, "platform", { value: "win32" });

  try {
    const launcher = resolveGatewayLauncher("opencode-cron-gateway");
    assert.equal(launcher.command, process.execPath);
    assert.equal(launcher.args.length, 1);
    assert.match(launcher.args[0] ?? "", /dist[\\/]+src[\\/]+bin[\\/]+gateway\.js$/);
  } finally {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  }
});

test("resolveGatewayLauncher falls back to node when process.execPath is not node on Windows", () => {
  const originalPlatform = process.platform;
  const originalExecPath = process.execPath;
  Object.defineProperty(process, "platform", { value: "win32" });
  Object.defineProperty(process, "execPath", {
    value: "C:\\Tools\\opencode.exe",
    configurable: true,
  });

  try {
    const launcher = resolveGatewayLauncher("opencode-cron-gateway");
    assert.equal(launcher.command, process.env.ComSpec ?? "cmd.exe");
    assert.deepEqual(launcher.args, ["/d", "/s", "/c", "opencode-cron-gateway"]);
  } finally {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "execPath", {
      value: originalExecPath,
      configurable: true,
    });
  }
});

test("buildGatewayServeArgs returns the expected serve arguments", () => {
  const args = buildGatewayServeArgs({
    rootDir: "C:\\Users\\Lucas\\.config\\opencode\\cron",
    gatewayCommand: "opencode-cron-gateway",
    defaultCommand: "opencode",
    pollIntervalMs: 30_000,
  });

  assert.deepEqual(args, [
    "serve",
    "--root",
    "C:\\Users\\Lucas\\.config\\opencode\\cron",
    "--command",
    "opencode",
    "--poll-ms",
    "30000",
  ]);
});

test("resolveWindowsGatewayLauncher preserves explicit gateway commands", () => {
  const launcher = resolveWindowsGatewayLauncher("C:\\Tools\\opencode-cron-gateway.cmd");

  assert.deepEqual(launcher, ['"C:\\Tools\\opencode-cron-gateway.cmd"']);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
