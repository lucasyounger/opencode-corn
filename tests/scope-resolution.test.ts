import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobStore } from "../src/store/job-store.js";
import { CronJob } from "../src/core/types.js";
import { createLegacyScopeId, createScopeId } from "../src/utils/paths.js";

test("resolveStoresForWorkdir migrates a legacy hashed scope to the prefixed scope", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-cron-scope-"));
  const workdir = "L:/Data/opencode-corn";
  const legacyScope = createLegacyScopeId(workdir);
  const preferredScope = createScopeId(workdir);
  const legacyStore = new JobStore(rootDir, legacyScope);

  await legacyStore.upsertJob(buildJob("job-legacy", workdir));
  await fs.appendFile(legacyStore.getLogPath("job-legacy"), "legacy log\n", "utf8");

  const resolved = await JobStore.resolveStoresForWorkdir(rootDir, workdir);
  const migratedJob = await resolved.primaryStore.getJob("job-legacy");
  const migratedLog = await fs.readFile(resolved.primaryStore.getLogPath("job-legacy"), "utf8");

  assert.equal(resolved.preferredScope, preferredScope);
  assert.equal(resolved.primaryStore.scope, preferredScope);
  assert.equal(migratedJob?.id, "job-legacy");
  assert.equal(migratedLog, "legacy log\n");

  await assert.rejects(fs.access(path.join(rootDir, "scopes", legacyScope)));
  await assert.rejects(fs.access(path.join(rootDir, "logs", legacyScope)));
});

function buildJob(id: string, workdir: string): CronJob {
  return {
    id,
    name: id,
    prompt: "run",
    schedule: "*/5 * * * *",
    timezone: "UTC",
    workdir,
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
    nextRunAt: "2026-04-18T00:05:00.000Z",
  };
}
