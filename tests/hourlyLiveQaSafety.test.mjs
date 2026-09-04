import test from "node:test";
import assert from "node:assert/strict";
import { assertQaAccount, assertQaSnapshot, summarizeMeasurements } from "../scripts/hourlyLiveQaSafety.mjs";

const runId = "123-abcdef";
const account = { role: "a", id: "qa-a", email: `qa-hourly-a-${runId}@example.test`, workspace: { id: `space-hourly-a-${runId}` } };
const user = { id: account.id, email: account.email, user_metadata: { account_space_id: account.workspace.id } };
const fixture = { accounts: [account, { id: "qa-b", workspace: { id: "personal-b" } }],
  spaceIds: [account.workspace.id, "shared"], sharedId: "shared", eventId: "event", eventName: "QA hourly 123-abcdef" };
const shared = { id: "shared", snapshot_kind: "shared_event", owner_user_id: null,
  state: { events: [{ id: "event", name: fixture.eventName, createdByParticipantId: "account-qa-a", participantIds: ["account-qa-a", "account-qa-b"] }] } };

test("cleanup accepts the exact synthetic account and owner-checked snapshots", () => {
  assertQaAccount(user, account, runId);
  assertQaSnapshot({ id: account.workspace.id, owner_user_id: account.id }, fixture);
  assertQaSnapshot(shared, fixture);
});
test("cleanup rejects an account with a real email", () => {
  assert.throws(() => assertQaAccount({ ...user, email: "real@example.com" }, account, runId));
});
test("cleanup rejects an account from a different run", () => {
  assert.throws(() => assertQaAccount(user, account, "other-run"));
});
test("cleanup rejects a personal snapshot with changed ownership", () => {
  assert.throws(() => assertQaSnapshot({ id: account.workspace.id, owner_user_id: "other-user" }, fixture));
});
test("cleanup rejects a target outside the exact manifest", () => {
  assert.throws(() => assertQaSnapshot({ ...shared, id: "other" }, fixture));
});
test("cleanup rejects a shared event containing a real participant", () => {
  const row = structuredClone(shared); row.state.events[0].participantIds.push("real-user");
  assert.throws(() => assertQaSnapshot(row, fixture));
});
test("cleanup rejects a renamed event or a non-QA creator", () => {
  for (const change of [{ name: "Real event" }, { createdByParticipantId: "real-user" }]) {
    const row = structuredClone(shared); Object.assign(row.state.events[0], change);
    assert.throws(() => assertQaSnapshot(row, fixture));
  }
});
test("latency summary keeps startup/save separate from cross-user synchronization", () => {
  assert.deepEqual(summarizeMeasurements([{ kind: "save", ms: 9999 }, { kind: "sync", ms: 100 }, { kind: "sync", ms: 500 }]),
    { samples: 2, p50Ms: 100, p95Ms: 500, maxMs: 500 });
  assert.deepEqual(summarizeMeasurements([]), { samples: 0, p50Ms: null, p95Ms: null, maxMs: null });
});
