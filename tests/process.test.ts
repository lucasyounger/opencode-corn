import test from "node:test";
import assert from "node:assert/strict";
import { buildOpencodeRunArgs, resolveSpawnSpec } from "../src/core/process.js";

test("buildOpencodeRunArgs matches the current OpenCode CLI contract", () => {
  assert.deepEqual(buildOpencodeRunArgs("git status"), [
    "run",
    "--dangerously-skip-permissions",
    "git status",
  ]);
});

test("buildOpencodeRunArgs passes through configured agent and model", () => {
  assert.deepEqual(
    buildOpencodeRunArgs("git status", {
      agent: "plan",
      model: {
        providerID: "opencode",
        modelID: "gpt-5-nano",
      },
    }),
    [
      "run",
      "--dangerously-skip-permissions",
      "--agent",
      "plan",
      "--model",
      "opencode/gpt-5-nano",
      "git status",
    ],
  );
});

test("resolveSpawnSpec returns passthrough on non-Windows", () => {
  const originalPlatform = process.platform;
  Object.defineProperty(process, "platform", { value: "linux" });

  try {
    const result = resolveSpawnSpec("opencode", ["run", "--help"]);
    assert.deepEqual(result, {
      command: "opencode",
      args: ["run", "--help"],
    });
  } finally {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  }
});

test("resolveSpawnSpec wraps commands through cmd.exe on Windows", () => {
  const originalPlatform = process.platform;
  const originalComSpec = process.env.ComSpec;
  Object.defineProperty(process, "platform", { value: "win32" });
  process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";

  try {
    const result = resolveSpawnSpec("opencode", ["run", "--help"]);
    assert.deepEqual(result, {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "opencode", "run", "--help"],
    });
  } finally {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalComSpec === undefined) {
      delete process.env.ComSpec;
    } else {
      process.env.ComSpec = originalComSpec;
    }
  }
});
