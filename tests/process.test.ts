import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildOpencodeRunArgs,
  resolveAvailableRunCommand,
  resolveRunCommandCandidates,
  resolveSpawnSpec,
} from "../src/core/process.js";

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

test("resolveRunCommandCandidates prefers opencode and falls back to nga", () => {
  assert.deepEqual(resolveRunCommandCandidates("auto"), ["opencode", "nga"]);
  assert.deepEqual(resolveRunCommandCandidates("opencode"), ["opencode", "nga"]);
  assert.deepEqual(resolveRunCommandCandidates("nga"), ["nga", "opencode"]);
  assert.deepEqual(resolveRunCommandCandidates("custom-cli"), ["custom-cli"]);
});

test("resolveAvailableRunCommand falls back to nga when opencode is unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-cron-process-"));
  const ngaCommand = path.join(tempDir, process.platform === "win32" ? "nga.cmd" : "nga");
  await fs.writeFile(ngaCommand, "", "utf8");

  const resolved = await resolveAvailableRunCommand("opencode", {
    PATH: tempDir,
    PATHEXT: ".CMD;.EXE",
  });

  assert.equal(resolved, "nga");
});

test("resolveAvailableRunCommand returns a custom command without extra aliases", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-cron-custom-"));
  const customCommand = path.join(tempDir, process.platform === "win32" ? "custom-cli.cmd" : "custom-cli");
  await fs.writeFile(customCommand, "", "utf8");

  const resolved = await resolveAvailableRunCommand("custom-cli", {
    PATH: tempDir,
    PATHEXT: ".CMD;.EXE",
  });

  assert.equal(resolved, "custom-cli");
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
