#!/usr/bin/env node
import { JobStore } from "../store/job-store.js";

async function main(): Promise<void> {
  const [rootDir, scope] = process.argv.slice(2);
  if (!rootDir || !scope) {
    throw new Error("Usage: opencode-corn-manage <rootDir> <scope>");
  }

  const store = new JobStore(rootDir, scope);
  const jobs = await store.listJobs();
  process.stdout.write(`${JSON.stringify(jobs, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
