import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  ACCOUNT_OAUTH_FLOW_QUERY_PARAM, ACCOUNT_RECOVERY_FLOW_PURPOSE,
  createAccountOAuthFlowId, saveAccountOAuthFlow, loadAccountOAuthFlow,
  clearAccountOAuthFlow
} from "../src/data/accountAuth.mjs";

const source = (await readFile("src/publicAccountAuthLayer.mjs", "utf8")).replaceAll("\r\n", "\n");
const start = source.indexOf("async function setupAccountAuth(");
const end = source.indexOf("\n}\n", start) + 2;
assert.ok(start >= 0 && end > start);

for (const scenario of ["expired code", "unbound code", "provider rejected"]) {
  test(`OAuth ${scenario} cleans its callback and restores login options with visible feedback`, async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const id = createAccountOAuthFlowId();
    if (scenario !== "unbound code") saveAccountOAuthFlow({ id, verifier: "a".repeat(43), returnPath: "/" }, storage);
    const search = scenario === "provider rejected"
      ? `?error=access_denied&auth_flow=${id}` : `?code=single-use-code&auth_flow=${id}`;
    const gates = [];
    let exchanges = 0;
    let discoveries = 0;
    let cleanups = 0;
    const context = vm.createContext({
      URLSearchParams, String, Boolean,
      window: { location: { search, hash: "" } },
      runtimeConfig: null, accountSession: null,
      googleEnabled: false, appleEnabled: false, providerDiscoveryState: "loading", emailAuthExpanded: false,
      ACCOUNT_OAUTH_FLOW_QUERY_PARAM, ACCOUNT_RECOVERY_FLOW_PURPOSE,
      AUTH_CHANGED_MARKER: "ready", ACCOUNT_DELETED_MARKER: "deleted",
      ACCOUNT_NOTICE_MARKER: "notice",
      loadRuntimeConfig: async () => ({ storage: { mode: "supabase" } }),
      runtimeConfigUsesFallback: () => false,
      loadAccountOAuthFlow: id => loadAccountOAuthFlow(id, storage),
      clearAccountOAuthFlow: id => clearAccountOAuthFlow(id, storage),
      authCallbackType: () => "", sessionFromOAuthHash: () => null,
      oauthPkceVerifier: () => "", clearOAuthPkceVerifier() {},
      exchangeOAuthCode: async () => { exchanges++; throw Object.assign(new Error("Authorization code expired"), { status: 400 }); },
      cleanAuthHash: () => { cleanups++; }, rememberAccountNotice() {}, emitOperationFailure() {},
      loadStoredAccountSession: () => null,
      removeSessionValue() {}, sessionValue: () => null,
      googleAuthConfiguredForCurrentPlatform: () => true, isNativeIos: () => true,
      renderAccountGate: gate => gates.push(gate),
      refreshProviderOptions: async () => { discoveries++; }
    });
    vm.runInContext(source.slice(start, end), context);
    await vm.runInContext("setupAccountAuth()", context);
    assert.equal(exchanges, scenario === "expired code" ? 1 : 0);
    assert.equal(cleanups, 1);
    assert.equal(loadAccountOAuthFlow(id, storage), null);
    assert.equal(gates.length, 1);
    assert.match(gates[0].error ?? "", /ההתחברות לא הושלמה/);
    assert.equal(discoveries, 1, "Apple and Google must be rediscovered for the next attempt");
  });
}
