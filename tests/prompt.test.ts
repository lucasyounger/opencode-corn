import test from "node:test";
import assert from "node:assert/strict";
import { renderPrompt } from "../src/core/prompt.js";
import type { CronJob } from "../src/core/types.js";

test("renderPrompt frames jobs as unattended one-shot work", () => {
  const prompt = renderPrompt(
    buildJob({
      prompt: "Summarize git status.",
    }),
  );

  assert.match(prompt, /This is an unattended one-shot execution\./);
  assert.match(prompt, /No follow-up messages will arrive\./);
  assert.match(prompt, /Complete the task now instead of asking for more instructions\./);
  assert.match(prompt, /Do not create new recurring work from inside this run\./);
  assert.match(prompt, /Return only the final result\./);
  assert.match(prompt, /\nTask:\nSummarize git status\.$/);
  assert.doesNotMatch(prompt, /scheduled OpenCode automation job/);
  assert.doesNotMatch(prompt, /Execution constraints:/);
});

test("renderPrompt includes enabled skills before the task body", () => {
  const prompt = renderPrompt(
    buildJob({
      prompt: "Run the requested workflow.",
      skills: ["checks", "docs"],
    }),
  );

  assert.match(prompt, /Enabled skills:\n- checks\n- docs/);
  assert.match(prompt, /Task:\nRun the requested workflow\.$/);
});

function buildJob(overrides: Partial<CronJob>): CronJob {
  return {
    id: "job-test",
    name: "job-test",
    prompt: "run",
    schedule: "0 9 * * *",
    timezone: "Asia/Shanghai",
    workdir: "L:/Data/opencode-cron",
    status: "enabled",
    mode: "cli",
    sessionStrategy: "new",
    skills: [],
    timeoutSeconds: 60,
    overlapPolicy: "skip",
    catchUpPolicy: "skip",
    delivery: {
      mode: "log",
    },
    backend: {
      kind: "gateway",
      extraArgs: [],
    },
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    ...overrides,
  };
}
