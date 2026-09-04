import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { isEventClosed } from "../src/domain/eventFilters.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function sendPaymentReminderWithAccountRecovery(");
const recovery = source.slice(start, source.indexOf("async function refreshNotificationInbox(", start));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const configFor = id => ({ storage: { mode: "supabase", account: { userId: id, accessToken: `synthetic-${id}` } } });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function harness({ config = null, flush = null, send = null, refresh = null } = {}) {
  const calls = [], refreshes = [];
  const context = vm.createContext({
    session: { user: { id: A } }, state: { currentParticipantId: `account-${A}` },
    runtimeConfig: configFor(A), window: { localStorage: {} },
    loadStoredAccountSession: () => context.session,
    pendingMutationOwnerIsActive: id => context.session?.user?.id === id,
    flushPendingSharedState: () => flush ? flush(context) : Promise.resolve({ ok: true, empty: true }),
    loadRuntimeConfig: () => config ? config(context) : Promise.resolve(configFor(context.session.user.id)),
    sendPaymentReminder: async (cfg, request) => {
      if (!cfg?.storage?.account?.accessToken) return { ok: false, reason: "unavailable" };
      calls.push({ config: cfg, request });
      return send ? send(cfg, request) : { ok: true, inbox: true, reason: "in-app-only" };
    },
    SogrimAccountSession: { refresh: async () => {
      refreshes.push(true);
      return refresh ? refresh(context) : { access_token: "synthetic-fresh", user: { id: A } };
    } }
  });
  vm.runInContext(recovery, context);
  return { context, calls, refreshes, run: () => context.sendPaymentReminderWithAccountRecovery("event-reminder", "transfer-reminder") };
}

test("a locally expired runtime identity refreshes once before sending the reminder", async () => {
  let fresh = false;
  const h = harness({ config: async () => fresh ? configFor(A) : { storage: { mode: "supabase" } },
    refresh: async () => { fresh = true; return { access_token: "synthetic-fresh", user: { id: A } }; } });
  assert.equal((await h.run()).ok, true);
  assert.equal(h.refreshes.length, 1);
  assert.equal(h.calls.length, 1);
});

test("the bell waits for pending cloud changes before asking the server to resolve the transfer", async () => {
  const started = deferred(), pending = deferred();
  const h = harness({ flush: () => { started.resolve(); return pending.promise; } });
  const request = h.run();
  // A microtask checkpoint also fails deterministically if no flush occurs.
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(h.calls.length, 0, "no reminder may precede its pending expense"); }
  finally { pending.resolve({ ok: true }); await request; }
  assert.equal(h.calls.length, 1);
});

for (const result of [{ ok: false }, { ok: true, pending: true }, { ok: true, superseded: true }]) {
  test(`unconfirmed pending changes prevent a reminder: ${JSON.stringify(result)}`, async () => {
    const h = harness({ flush: async () => result });
    await assert.rejects(h.run(), { code: "EVENT_NOT_SYNCED" });
    assert.equal(h.calls.length, 0);
  });
}

test("an account switch while loading config cannot send the old action as the new user", async () => {
  const h = harness({ config: async context => {
    context.session = { user: { id: B } };
    context.state.currentParticipantId = `account-${B}`;
    return configFor(B);
  } });
  await assert.rejects(h.run(), { code: "STALE_ACCOUNT" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.refreshes.length, 0);
});

test("an account switch during the outbox wait stops the reminder before config or delivery", async () => {
  const h = harness({ flush: async context => {
    context.session = { user: { id: B } };
    context.state.currentParticipantId = `account-${B}`;
    return { ok: true };
  } });
  await assert.rejects(h.run(), { code: "STALE_ACCOUNT" });
  assert.equal(h.calls.length, 0);
});

test("a refresh returning another user never sends a reminder with their token", async () => {
  const h = harness({ config: async () => ({ storage: { mode: "supabase" } }),
    refresh: async () => ({ access_token: "synthetic-other-user", user: { id: B } }) });
  await assert.rejects(h.run(), { code: "STALE_ACCOUNT" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.refreshes.length, 1);
});

test("a server 401 can refresh once and resend, but ambiguous delivery is never retried", async () => {
  let attempts = 0;
  const auth = harness({ send: async () => {
    if (++attempts === 1) throw Object.assign(new Error("Expired"), { status: 401 });
    return { ok: true };
  } });
  assert.equal((await auth.run()).ok, true);
  assert.equal(auth.calls.length, 2);
  assert.equal(auth.refreshes.length, 1);
  const ambiguous = harness({ send: async () => { throw Object.assign(new Error("Unknown delivery"), { status: 502, code: "DELIVERY_UNCONFIRMED" }); } });
  await assert.rejects(ambiguous.run(), { code: "DELIVERY_UNCONFIRMED" });
  assert.equal(ambiguous.calls.length, 1);
  assert.equal(ambiguous.refreshes.length, 0);
});

test("bell eligibility hides reminders until closing, and hides them again on reopening or payment", () => {
  const eligibilityStart = source.indexOf("function paymentReminderEligibility(");
  const eligibilitySource = source.slice(eligibilityStart, source.indexOf("function renderTransferParticipant(", eligibilityStart));
  const context = vm.createContext({ runtimeConfig: configFor(A), isEventClosed,
    window: { localStorage: {} }, loadStoredAccountSession: () => ({ user: { id: A } }),
    state: { currentParticipantId: `account-${A}` } });
  vm.runInContext(eligibilitySource, context);
  const transfer = { id: "transfer-reminder", fromParticipantId: `account-${B}`, toParticipantId: `account-${A}`, status: "pending" };
  assert.equal(context.paymentReminderEligibility(transfer, { locked: false }).allowed, false);
  assert.equal(context.paymentReminderEligibility(transfer, { closedAt: "2026-09-04T12:00:00.000Z" }).allowed, true);
  assert.equal(context.paymentReminderEligibility(transfer, { locked: true }).allowed, true);
  assert.equal(context.paymentReminderEligibility(transfer, { closedAt: null, locked: false }).allowed, false);
  assert.equal(context.paymentReminderEligibility({ ...transfer, status: "paid" }, { locked: true }).allowed, false);
  assert.equal(context.paymentReminderEligibility({ ...transfer, toParticipantId: `account-${B}` }, { locked: true }).allowed, false);
});

function eligibilityHarness() {
  const eligibilityStart = source.indexOf("function paymentReminderEligibility(");
  const context = vm.createContext({
    runtimeConfig: { storage: { mode: "supabase" } }, isEventClosed,
    session: { expires_at: 1, user: { id: A } },
    window: { localStorage: {} }, loadStoredAccountSession: () => context.session,
    state: { currentParticipantId: `account-${A}` }
  });
  vm.runInContext(source.slice(eligibilityStart, source.indexOf("function renderTransferParticipant(", eligibilityStart)), context);
  const transfer = { fromParticipantId: `account-${B}`, toParticipantId: `account-${A}`, status: "pending" };
  return { context, check: () => context.paymentReminderEligibility(transfer, { locked: true }) };
}

test("a locally expired session keeps the closed-event bell reachable for guarded auth recovery", () => {
  const h = eligibilityHarness();
  assert.equal(h.check().allowed, true);
});

test("a stale runtime account cannot expose the bell after sign-out or a participant switch", () => {
  const h = eligibilityHarness();
  h.context.runtimeConfig = configFor(A);
  h.context.session = null;
  assert.equal(h.check().allowed, false);
  h.context.session = { user: { id: A } };
  h.context.state.currentParticipantId = `account-${B}`;
  assert.equal(h.check().allowed, false);
});
