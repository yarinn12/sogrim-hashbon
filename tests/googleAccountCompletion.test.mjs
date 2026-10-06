import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile("src/publicAccountAuthLayer.mjs", "utf8")).replaceAll("\r\n", "\n");
const start = source.indexOf("async function completeGoogleIdTokenSignIn(");
const end = source.indexOf("\n}\n", start) + 2;
assert.ok(start >= 0 && end > start);

test("accepted Google credentials keep the account locked for recovery after a transient user lookup failure", async () => {
  const gates = [];
  let localResumes = 0;
  const session = { access_token: "fixture-access", refresh_token: "fixture-refresh", user: { id: "fixture-user" } };
  const context = vm.createContext({
    accountSession: null, accountSignInPending: false, runtimeConfig: {},
    loadStoredAccountSession: () => null,
    signInWithIdToken: async () => session,
    saveAccountSession: value => value,
    renderAccountRecoveryGate: options => gates.push(options ?? {}),
    restoreAccountSession: async () => { throw Object.assign(new Error("Temporary account outage"), { status: 503 }); },
    accountProfileNeedsCompletion: () => false,
    canResumeOffline: () => true,
    resumeAccountLocally: () => { localResumes++; },
    watchAccountControls() {}, enhanceAccountControls() {}, emitOperationFailure() {}
  });
  vm.runInContext(source.slice(start, end), context);
  await vm.runInContext('completeGoogleIdTokenSignIn({ idToken: "fixture-id" })', context);
  assert.equal(localResumes, 0, "a fresh login must not expose an unhydrated account");
  assert.equal(context.accountSignInPending, true);
  assert.equal(context.accountSession, session);
  assert.equal(gates.length, 2);
  assert.equal(gates[0].connecting, true);
});
