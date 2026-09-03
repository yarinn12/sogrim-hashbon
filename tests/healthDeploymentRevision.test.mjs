import test from "node:test";
import assert from "node:assert/strict";
import { getHealthPayload } from "../src/server/health.mjs";

test("health exposes only a validated deployment commit for live verification", () => {
  const deploymentRevision = "1234567890abcdef1234567890abcdef12345678";
  assert.equal(getHealthPayload({}, { deploymentRevision }).deploymentRevision, deploymentRevision);
  for (const invalid of [undefined, "", "some private environment value", "a".repeat(41)]) {
    assert.equal(Object.hasOwn(getHealthPayload({}, { deploymentRevision: invalid }), "deploymentRevision"), false);
  }
});
