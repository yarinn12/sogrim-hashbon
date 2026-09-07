import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const source = app.slice(app.indexOf("function retryPendingEventMembershipInvitations()"),
  app.indexOf("function pendingMutationRecoveryCount()"));

function harness() {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const published = [], forgotten = [];
  const context = vm.createContext({
    appBootHydrated: true, navigator: { onLine: true }, pendingEventMembershipRetryRequest: null,
    owner: "owner-a", generation: 1,
    pendingEventMembershipOwnerId: () => context.owner,
    versionedReadCacheSessionGeneration: () => context.generation,
    loadPendingEventMembershipInvitations: () => [{ ownerUserId: "owner-a", eventId: "new-event", participantId: "peer" }],
    flushPendingSharedState: () => gate,
    pendingSharedSyncStatus: () => ({ pending: false, pendingEventIds: [] }),
    getEvent: () => ({ id: "new-event", participantIds: ["peer"] }),
    state: { participants: [{ id: "peer" }] }, isEventParticipantInactive: () => false,
    forgetPendingEventMembershipInvitation: (...args) => forgotten.push(args),
    publishEventInvitation: async (...args) => { published.push(args); }
  });
  vm.runInContext(source, context);
  return { context, published, forgotten, release };
}

test("invitation recovery waits for the original outbox publication before preparing membership", async () => {
  const h = harness();
  const request = h.context.retryPendingEventMembershipInvitations();
  await Promise.resolve();
  assert.equal(h.published.length, 0, "a pending invitation cannot start a second event creation");
  h.release({ ok: true });
  await request;
  assert.equal(h.published.length, 1);
  assert.equal(h.forgotten.length, 0);
});

for (const result of [{ ok: false }, { ok: true, pending: true }, { ok: false, mode: "stale-account" }]) {
  test(`invitation recovery preserves its receipt when publication is incomplete: ${JSON.stringify(result)}`, async () => {
    const h = harness();
    const request = h.context.retryPendingEventMembershipInvitations();
    h.release(result); await request;
    assert.equal(h.published.length, 0);
    assert.equal(h.forgotten.length, 0);
    assert.equal(h.context.pendingEventMembershipRetryRequest, null);
  });
}

for (const change of ["account", "account-round-trip"]) {
  test(`invitation recovery cannot cross an ${change} boundary while awaiting publication`, async () => {
    const h = harness();
    const request = h.context.retryPendingEventMembershipInvitations();
    if (change === "account") h.context.owner = "owner-b";
    h.context.generation++;
    h.release({ ok: true }); await request;
    assert.equal(h.published.length, 0);
    assert.equal(h.forgotten.length, 0);
  });
}

test("a failed unrelated event cannot block invitation recovery for a published event", async () => {
  const h = harness();
  h.context.pendingSharedSyncStatus = () => ({ pending: true, pendingEventIds: ["other-event"] });
  const request = h.context.retryPendingEventMembershipInvitations();
  h.release({ ok: false }); await request;
  assert.equal(h.published.length, 1);
});

for (const pendingEventIds of [["new-event"], []]) {
  test(`invitation recovery still waits for its own or unscoped pending publication: ${JSON.stringify(pendingEventIds)}`, async () => {
    const h = harness();
    h.context.pendingSharedSyncStatus = () => ({ pending: true, pendingEventIds });
    const request = h.context.retryPendingEventMembershipInvitations();
    h.release({ ok: false }); await request;
    assert.equal(h.published.length, 0);
    assert.equal(h.forgotten.length, 0);
  });
}
