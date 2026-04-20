import fs from "node:fs/promises";
import { tool } from "@opencode-ai/plugin";
import { parsePluginOptions } from "../core/schema.js";
import { JobStore } from "../store/job-store.js";
import { createScopeId, normalizeAbsolutePath } from "../utils/paths.js";

export function createCronLogsTool(options: unknown): ReturnType<typeof tool> {
  const parsedOptions = parsePluginOptions(options);
  const rootDir = normalizeAbsolutePath(parsedOptions.rootDir);

  return tool({
    description: "Read logs for a scheduled OpenCode job.",
    args: {
      jobId: tool.schema.string().min(1),
      workdir: tool.schema.string().optional(),
    },
    async execute(args, context) {
      const workdir = normalizeAbsolutePath(args.workdir ?? context.directory);
      const scope = createScopeId(workdir);
      const store = new JobStore(rootDir, scope);
      try {
        return await fs.readFile(store.getLogPath(args.jobId), "utf8");
      } catch {
        return "";
      }
    },
  });
}
