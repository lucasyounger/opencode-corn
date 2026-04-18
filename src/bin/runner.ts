#!/usr/bin/env node
import { pluginOptionsSchema } from "../core/schema.js";
import { runJob } from "../core/runner.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "run") {
    throw new Error("Usage: opencode-corn-runner run --scope <scope> --job <job-id> [--root <dir>] [--command <cmd>]");
  }

  const scope = readFlag(args, "--scope");
  const jobId = readFlag(args, "--job");
  const rootDir = readOptionalFlag(args, "--root") ?? pluginOptionsSchema.parse({}).rootDir;
  const command = readOptionalFlag(args, "--command") ?? pluginOptionsSchema.parse({}).defaultCommand;

  const record = await runJob(
    {
      rootDir,
      scope,
      command,
    },
    jobId,
  );

  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

function readFlag(args: string[], name: string): string {
  const value = readOptionalFlag(args, name);
  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return value;
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
