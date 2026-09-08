import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { recoverAccessibleSharedEvents, saveSharedEventState } from "../src/data/sharedEventStore.mjs";
import { ensureNamedParticipant } from "../src/domain/userProfile.mjs";
import { isActiveEventParticipant } from "../src/domain/eventMembership.mjs";
import * as queue from "../src/data/pendingEventJoins.mjs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const recovery = app.slice(app.indexOf("function retryPendingEventJoins()"), app.indexOf("function loadPendingEventMembershipInvitations()"));
const owner = "00000000-0000-4000-8000-000000000071";
const participantId = `account-${owner}`;
const eventId = "join-recovery-trip", spaceId = "join-recovery-space";
const receipt = { ownerUserId: owner, eventId, queuedAt: "2026-08-01T00:00:00.000Z" };
let harnessNumber = 0;

function harness({ duringConfig, duringRead, duringSave, removed = false } = {}) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  queue.rememberPendingEventJoin(receipt, storage);
  const time = "2026-08-01T01:00:00.000Z";
  const initial = { currentParticipantId: participantId, groups: [], deletedParticipants: [], participants: [
    { id: participantId, displayName: "Member", kind: "user", accountLinked: true }
  ], events: [{ id: eventId, name: "Recovery trip", participantIds: [participantId], adminIds: [participantId],
    createdByParticipantId: participantId, updatedAt: time, expenses: [], transfers: [], notes: [],
    sharedSpaceId: spaceId, sharedSpaceKey: "join_recovery_synthetic_space_key_0001",
    ...(removed ? { inactiveParticipantIds: [participantId], membershipUpdatedAtByParticipant: { [participantId]: time } } : {})
  }] };
  let canonical = structuredClone(initial), version = time, activeOwner = owner, generation = 0, revision = 0;
  let readHook = duringRead, configHook = duringConfig, saveHook = duringSave;
  const writes = [], errors = [];
  const config = { storage: { mode: "supabase", url: `https://join-recovery-${++harnessNumber}.invalid`, anonKey: "synthetic", table: "app_snapshots", account: { userId: owner, accessToken: "synthetic" } } };
  const switchSession = (differentAccount = false) => {
    generation++;
    activeOwner = differentAccount ? "another-account" : owner;
    ctx.state = { ...structuredClone(initial), currentParticipantId: differentAccount ? "account-another-account" : participantId, nextSession: true };
    ctx.runtimeConfig = { storage: { ...config.storage, account: { ...config.storage.account, userId: activeOwner } }, nextSession: true };
  };
  const changeLocalState = () => {
    revision++;
    ctx.state = structuredClone(ctx.state);
    ctx.state.events[0].expenses.push({ id: "new-local-expense", name: "Local change while reading", total: 1234,
      payers: [{ participantId, amount: 1234 }], sharedByParticipantIds: [participantId], createdByParticipantId: participantId,
      updatedAt: "2026-08-01T02:00:00.000Z", kind: "shared" });
  };
  const hook = kind => {
    if (kind === "same-session-restart") switchSession();
    if (kind === "different-account") switchSession(true);
    if (kind === "local-edit") changeLocalState();
  };
  const transport = async (url, options = {}) => {
    if (url.includes("/rpc/join_shared_event")) return new Response("true");
    if (url.includes("/rpc/update_shared_event_snapshot")) {
      const body = JSON.parse(options.body);
      assert.equal(body.p_expected_updated_at, version);
      writes.push(structuredClone(body)); canonical = structuredClone(body.p_state);
      version = new Date(Date.parse(version) + 1).toISOString();
      return new Response(JSON.stringify({ status: "updated", updatedAt: version }));
    }
    assert.equal(options.method ?? "GET", "GET");
    const rows = [{ id: spaceId, state: structuredClone(canonical), updated_at: version, snapshot_kind: "shared_event" }];
    const next = readHook; readHook = null; hook(next);
    return new Response(JSON.stringify(rows));
  };
  const ctx = vm.createContext({ state: structuredClone(initial), runtimeConfig: config, window: { localStorage: storage },
    navigator: { onLine: true }, appBootHydrated: true, pendingEventJoinRetryRequest: null,
    pendingEventMembershipOwnerId: () => activeOwner, pendingMutationOwnerIsActive: id => activeOwner === id,
    versionedReadCacheSessionGeneration: () => generation, sharedStateSaveRevision: () => revision,
    loadRuntimeConfig: async () => { const next = configHook; configHook = null; hook(next); return config; },
    recoverAccessibleSharedEvents: (c, state) => recoverAccessibleSharedEvents(c, state, transport),
    syncLocalProfile: state => state, getEvent: id => ctx.state.events.find(event => event.id === id),
    ensureNamedParticipant, isActiveEventParticipant, ...queue,
    saveSharedState: async (state, options) => {
      assert.deepEqual(Array.from(options.forceSharedEventIds), [eventId]);
      await saveSharedEventState(config, state, eventId, transport);
      const next = saveHook; saveHook = null; hook(next);
      return { ok: true };
    }, emitOperationDeferred: (_kind, value) => errors.push(value) });
  vm.runInContext(recovery, ctx);
  return { ctx, writes, errors, initial, get canonical() { return canonical; },
    pending: () => queue.loadPendingEventJoins(storage, owner), run: () => ctx.retryPendingEventJoins() };
}

test("a recovered membership is persisted once and acknowledges its durable join receipt", async () => {
  const h = harness(); await h.run();
  assert.equal(h.writes.length, 1); assert.equal(h.pending().length, 0);
  assert.equal(h.canonical.events[0].participantIds.includes(participantId), true);
  await h.run(); assert.equal(h.writes.length, 1); assert.deepEqual(h.errors, []);
});

test("join recovery cannot replace the next account's runtime config after a late config read", async () => {
  const h = harness({ duringConfig: "different-account" }); await h.run();
  assert.equal(h.ctx.runtimeConfig.nextSession, true);
  assert.equal(h.ctx.runtimeConfig.storage.account.userId, "another-account");
  assert.equal(h.writes.length, 0); assert.equal(h.pending().length, 1);
});

test("join recovery cannot cross sign-out and sign-in to the same account", async () => {
  const h = harness({ duringRead: "same-session-restart" }); await h.run();
  assert.equal(h.ctx.state.nextSession, true);
  assert.equal(h.writes.length, 0); assert.equal(h.pending().length, 1);
});

test("a local expense entered during membership recovery survives and is included by the next retry", async () => {
  const h = harness({ duringRead: "local-edit" }); await h.run();
  assert.equal(h.ctx.state.events[0].expenses[0]?.id, "new-local-expense");
  assert.equal(h.writes.length, 0); assert.equal(h.pending().length, 1);
  await h.run();
  assert.equal(h.writes.length, 1); assert.equal(h.pending().length, 0);
  assert.equal(h.writes[0].p_state.events[0].expenses[0].total, 1234);
  assert.deepEqual(h.errors, []);
});

test("a late join save cannot acknowledge a receipt in a new session", async () => {
  const h = harness({ duringSave: "same-session-restart" }); await h.run();
  assert.equal(h.ctx.state.nextSession, true); assert.equal(h.pending().length, 1);
  assert.equal(h.writes.length, 1); assert.deepEqual(h.errors, []);
});

test("join recovery never reactivates a removed member", async () => {
  const h = harness({ removed: true }); await h.run();
  assert.equal(h.writes.length, 0); assert.equal(h.pending().length, 0);
  assert.equal(h.ctx.state.events[0].inactiveParticipantIds.includes(participantId), true);
});
