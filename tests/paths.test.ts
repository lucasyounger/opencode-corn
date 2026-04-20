import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyScopeId, createScopeId } from "../src/utils/paths.js";

test("createScopeId is stable for a given path", () => {
  const first = createScopeId("L:/repo");
  const second = createScopeId("L:/repo");
  assert.equal(first, second);
});

test("createScopeId includes a readable prefix plus the legacy hash", () => {
  const scope = createScopeId("L:/Data/opencode-corn");

  assert.equal(scope, `scope-opencode-corn-${createLegacyScopeId("L:/Data/opencode-corn")}`);
});
