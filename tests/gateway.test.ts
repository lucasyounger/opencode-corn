import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CronJob } from "../src/core/types.js";
import { selectDueJobs } from "../src/gateway/runtime.js";
import { JobStore } from "../src/store/job-store.js";

test("JobStore.listAllJobs returns jobs across scopes", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-corn-"));
  const alphaStore = new JobStore(rootDir, "alpha");
  const betaStore = new JobStore(rootDir, "beta");

  await alphaStore.upsertJob(buildJob("job-alpha", "2026-04-18T00:00:00.000Z"));
  await betaStore.upsertJob(buildJob("job-beta", "2026-04-19T00:00:00.000Z"));

  const jobs = await JobStore.listAllJobs(rootDir);
  const scopes = jobs.map((entry) => `${entry.scope}:${entry.job.id}`).sort();

  assert.deepEqual(scopes, ["alpha:job-alpha", "beta:job-beta"]);
});

test("selectDueJobs only includes enabled jobs whose nextRunAt has passed", () => {
  const now = new Date("2026-04-18T12:00:00.000Z");
  const entries = [
    { scope: "alpha", job: buildJob("due", "2026-04-18T11:59:00.000Z") },
    { scope: "alpha", job: buildJob("future", "2026-04-18T12:30:00.000Z") },
    { scope: "beta", job: { ...buildJob("paused", "2026-04-18T11:58:00.000Z"), status: "paused" as const } },
    { scope: "beta", job: { ...buildJob("missing", undefined), status: "enabled" as const } },
  ];

  const due = selectDueJobs(entries, now).map((entry) => entry.job.id).sort();

  assert.deepEqual(due, ["due", "missing"]);
});

function buildJob(id: string, nextRunAt: string | undefined): CronJob {
  return {
    id,
    name: id,
    prompt: "run",
    schedule: "*/5 * * * *",
    timezone: "UTC",
    workdir: "L:/repo",
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
    createdAt: "2026-04-18T00:00:00.000Z",
    updatedAt: "2026-04-18T00:00:00.000Z",
    nextRunAt,
  };
}
