import test from "node:test";
import assert from "node:assert/strict";
import { createScopeId } from "../src/utils/paths.js";

test("createScopeId is stable for a given path", () => {
  const first = createScopeId("L:/repo");
  const second = createScopeId("L:/repo");
  assert.equal(first, second);
});
