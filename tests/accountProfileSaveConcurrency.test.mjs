import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/publicAccountAuthLayer.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function updateSignedInAccountProfile(");
const body = source.slice(start, source.indexOf("function lockAccountGate()", start));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const sessionFor = id => ({ user: { id, user_metadata: { full_name: `User ${id}`, username: "original" } }, access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_at: 100 });
function harness() {
  const writes = [], saves = [], schedules = [];
  const context = vm.createContext({
    accountSession: sessionFor("a"), storedSession: sessionFor("a"), accountRefreshGeneration: 0, accountProfileUpdateQueue: null,
    runtimeConfig: { storage: { mode: "supabase" } }, normalizeProfileName: value => String(value ?? "").trim(),
    isFullProfileName: value => value.includes(" "), normalizeUsername: value => String(value ?? "").trim(), normalizeAvatarImage: value => String(value ?? ""),
    loadStoredAccountSession: () => context.storedSession,
    updateAccountUser: (config, session, data) => { const gate = deferred(); writes.push({ session, data, ...gate }); return gate.promise; },
    saveAccountSession: session => { saves.push(session); context.storedSession = session; return session; },
    scheduleAccountSessionRefresh: () => schedules.push(true)
  });
  vm.runInContext(body, context);
  return { context, writes, saves, schedules,
    save: payload => context.updateSignedInAccountProfile({ displayName: "New Name", ...payload }),
    complete: (index = 0) => writes[index].resolve({ ...writes[index].session, user: { ...writes[index].session.user, user_metadata: writes[index].data } }) };
}

test("profile metadata completion cannot revive an account after sign-out", async () => {
  const h = harness(); const request = h.save(); await tick();
  h.context.accountSession = null; h.context.storedSession = null; h.context.accountRefreshGeneration++;
  h.complete(); assert.equal(await request, false);
  assert.equal(h.saves.length, 0); assert.equal(h.context.accountSession, null);
});

test("profile metadata completion cannot replace a different account session", async () => {
  const h = harness(); const request = h.save(); await tick();
  h.context.accountSession = sessionFor("b"); h.context.storedSession = sessionFor("b");
  h.complete(); assert.equal(await request, false);
  assert.equal(h.saves.length, 0); assert.equal(h.context.accountSession.user.id, "b");
});

test("profile metadata completion checks the stored session too", async () => {
  const h = harness(); const request = h.save(); await tick();
  h.context.storedSession = sessionFor("b"); h.complete();
  assert.equal(await request, false); assert.equal(h.saves.length, 0);
});

test("profile metadata save preserves tokens refreshed while the write was pending", async () => {
  const h = harness(); const request = h.save(); await tick();
  h.context.accountSession = { ...h.context.accountSession, access_token: "new-access", refresh_token: "new-refresh", expires_at: 900 };
  h.context.storedSession = h.context.accountSession; h.complete();
  assert.equal(await request, true);
  assert.equal(h.context.accountSession.access_token, "new-access");
  assert.equal(h.context.accountSession.refresh_token, "new-refresh");
  assert.equal(h.context.accountSession.expires_at, 900);
  assert.equal(h.context.accountSession.user.user_metadata.full_name, "New Name");
});

test("overlapping metadata writes are serialized and retain the previous edit's omitted fields", async () => {
  const h = harness(); const first = h.save({ username: "chosen" });
  const second = h.save({ displayName: "Later Name" }); await tick();
  const beforeCompletion = h.writes.length;
  h.complete(0); await first; await tick(); h.complete(1); await second;
  assert.equal(beforeCompletion, 1, "the second request must not reach the server out of order");
  assert.equal(h.context.accountSession.user.user_metadata.username, "chosen");
  assert.equal(h.context.accountSession.user.user_metadata.full_name, "Later Name");
});

test("a failed profile update does not poison the next queued save", async () => {
  const h = harness(); const first = h.save(); const rejection = assert.rejects(first, /Temporary failure/);
  const second = h.save({ displayName: "Retry Name" }); await tick();
  h.writes[0].reject(new Error("Temporary failure")); await rejection; await tick();
  h.complete(1); assert.equal(await second, true);
  assert.equal(h.context.accountSession.user.user_metadata.full_name, "Retry Name");
});

test("a new account's save is not blocked by the previous account's pending request", async () => {
  const h = harness(); const first = h.save(); await tick();
  h.context.accountSession = sessionFor("b"); h.context.storedSession = sessionFor("b"); h.context.accountRefreshGeneration++;
  const second = h.save({ displayName: "Account B" }); await tick();
  assert.equal(h.writes.length, 2); h.complete(1); assert.equal(await second, true);
  h.complete(0); assert.equal(await first, false);
  assert.equal(h.context.accountSession.user.id, "b"); assert.equal(h.saves.length, 1);
});

test("a stale account at invocation cannot issue a profile update", async () => {
  const h = harness(); h.context.storedSession = sessionFor("b");
  const request = h.save(); await tick(); h.writes.forEach((_write, index) => h.complete(index));
  assert.equal(await request, false); assert.equal(h.writes.length, 0);
});
