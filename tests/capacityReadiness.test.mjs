import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contention = readFileSync("scripts/benchmark-shared-event-contention.mjs", "utf8");
const staging = readFileSync("scripts/probe-staging-capacity.mjs", "utf8");

test("contention benchmark verifies concurrent edits are never lost", () => {
  assert.match(contention, /a concurrent expense was lost/);
  assert.match(contention, /validateSharedStateFinancials/);
  assert.match(contention, /editors: 50/);
});

test("staging load probe is read-only and requires explicit approval", () => {
  assert.match(staging, /ALLOW_STAGING_LOAD_TEST === "1"/);
  assert.match(staging, /method: "GET"/);
  assert.match(staging, /writeRequestsGenerated: 0/);
  assert.match(staging, /Refusing to probe production host/);
  assert.match(staging, /configured production Supabase project/);
  assert.doesNotMatch(staging, /method: "(?:POST|PUT|PATCH|DELETE)"/);
});
