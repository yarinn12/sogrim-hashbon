import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { isTransientAccountError } from "../src/domain/accountErrors.mjs";

const source = readFileSync(new URL("../src/publicAccountAuthLayer.mjs", import.meta.url), "utf8");
const reconcileStart = source.indexOf("async function reconcileResumedAccountSession(");
const reconcile = source.slice(reconcileStart, source.indexOf("function lockForAccountSessionChange", reconcileStart));
const authCheckStart = source.indexOf("function isUnauthorizedAccountError(");
const authCheck = source.slice(authCheckStart, source.indexOf("function rememberAccountReturnUrl", authCheckStart));
assert.ok(reconcileStart > 0 && authCheckStart > 0);

const session = (id, token = id) => ({
  user: { id }, access_token: `access-${token}`, refresh_token: `refresh-${token}`
});
const failure = (status, authCode = "") =>
  Object.assign(new Error("Synthetic account response"), { status, authCode });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const pending = deferred();
  const initialSession = session("a");
  const effects = { saves: [], clears: 0, locks: 0, retries: 0, refreshes: 0 };
  const context = vm.createContext({
    accountSession: initialSession,
    storedSession: initialSession,
    accountRefreshGeneration: 0,
    ACCOUNT_REFRESH_RETRY_MS: 3_000,
    STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS: 12_000,
    runtimeConfig: {},
    restoreAccountSession: () => pending.promise,
    refreshAccountSession: async () => {
      effects.refreshes++;
      throw failure(401);
    },
    saveAccountSession: value => {
      effects.saves.push(value);
      context.storedSession = value;
      return value;
    },
    clearAccountSession: () => { effects.clears++; context.storedSession = null; },
    clearAccountRecoverySession: () => {},
    lockForAccountSessionChange: () => { effects.locks++; context.accountSession = null; },
    scheduleAccountSessionRefresh: () => { effects.retries++; },
    publishAccountSessionSync: () => {},
    document: { dispatchEvent: () => {} },
    Event: class {},
    isTransientAccountError
  });
  vm.runInContext(authCheck + "\n" + reconcile, context);
  return { context, pending, effects, initialSession,
    run: () => context.reconcileResumedAccountSession(initialSession) };
}

for (const status of [400, 403]) {
  test(`background workspace ${status} keeps the exact stored session and schedules recovery`, async () => {
    const h = harness(), result = h.run();
    h.pending.reject(failure(status));
    assert.equal(await result, null);
    assert.strictEqual(h.context.storedSession, h.initialSession);
    assert.equal(h.effects.clears, 0);
    assert.equal(h.effects.locks, 0);
    assert.equal(h.effects.retries, 1);
  });
}

for (const [status, authCode] of [
  [401, ""], [400, "refresh_token_not_found"],
  [403, "user_banned"], [403, "user_not_found"]
]) {
  test(`confirmed credential rejection ${status} ${authCode} still invalidates the session`, async () => {
    const h = harness(), result = h.run();
    assert.equal(h.context.isUnauthorizedAccountError(failure(status, authCode)), true);
    h.pending.reject(failure(status, authCode));
    assert.equal(await result, null);
    assert.equal(h.effects.refreshes, 1);
    assert.equal(h.context.storedSession, null);
    assert.equal(h.effects.clears, 1);
    assert.equal(h.effects.locks, 1);
  });
}

for (const replacement of [session("b"), session("a", "new-login")]) {
  test(`late old-account rejection cannot clear a newer ${replacement.user.id} session`, async () => {
    const h = harness(), result = h.run();
    h.context.accountSession = replacement;
    h.context.storedSession = replacement;
    h.context.accountRefreshGeneration += 1;
    h.pending.reject(failure(401));
    assert.equal(await result, null);
    assert.strictEqual(h.context.storedSession, replacement);
    assert.equal(h.effects.clears, 0);
    assert.equal(h.effects.locks, 0);
    assert.equal(h.effects.refreshes, 0);
  });
}
