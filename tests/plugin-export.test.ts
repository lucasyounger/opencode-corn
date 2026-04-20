import test from "node:test";
import assert from "node:assert/strict";
import pluginDefault, { OpencodeCronPlugin, OpencodeCronPluginModule } from "../src/index.js";

test("default export is callable and still exposes module metadata", () => {
  assert.equal(typeof pluginDefault, "function");
  assert.equal(pluginDefault, OpencodeCronPlugin);
  assert.equal(pluginDefault.id, "opencode-cron");
  assert.equal(pluginDefault.server, OpencodeCronPlugin);
  assert.equal(pluginDefault, OpencodeCronPluginModule);
});
