import type { Plugin } from "@opencode-ai/plugin";
import { createCronjobTool } from "./plugin/cronjob-tool.js";
import { createCronLogsTool } from "./plugin/logs-tool.js";

export const OpencodeCornPlugin: Plugin = async (input, options) => {
  return {
    tool: {
      cronjob: createCronjobTool(options),
      cron_logs: createCronLogsTool(options),
    },
    event: async ({ event }) => {
      if (event.type === "session.error") {
        await input.client.app
          .log({
            body: {
              service: "opencode-corn",
              level: "error",
              message: JSON.stringify(event),
            },
          })
          .catch(() => undefined);
      }
    },
  };
};

export default {
  id: "opencode-corn",
  server: OpencodeCornPlugin,
};
