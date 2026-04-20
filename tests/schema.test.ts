import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginOptions } from "../src/core/schema.js";

test("parsePluginOptions falls back to defaults when input is undefined", () => {
  const options = parsePluginOptions(undefined);

  assert.equal(options.rootDir, "~/.config/opencode/cron");
  assert.equal(options.defaultCommand, "auto");
  assert.equal(options.gatewayCommand, "opencode-cron-gateway");
  assert.equal(options.gatewayPollIntervalMs, 30_000);
});
