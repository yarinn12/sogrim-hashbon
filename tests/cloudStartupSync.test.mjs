import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app startup avoids an unconditional cloud write after every reload", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const startup = app.slice(
    app.indexOf("async function hydrateAppForActiveAccount()"),
    app.indexOf("function renderScopedLocalFallback()")
  );

  assert.match(startup, /hasSharedStateChanged\(sharedState, nextState\)/);
  assert.match(
    startup,
    /const startupProfileSaveRequest = shouldSaveJoinedProfile\s*\? saveSharedState\(state\)\s*:\s*null/
  );
  assert.doesNotMatch(startup, /await saveSharedState\(state\)/);
  assert.match(
    startup,
    /appBootHydrated = true;\s*render\(\);\s*startupProfileSaveRequest\?\.catch\(\(\) => \{\}\)/
  );
  assert.doesNotMatch(startup, /if \(localProfile\) await saveSharedState\(state\)/);
});

test("the first app render does not wait for the online friend network", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const startup = app.slice(
    app.indexOf("async function hydrateAppForActiveAccount()"),
    app.indexOf("function renderScopedLocalFallback()")
  );

  assert.match(
    startup,
    /appBootHydrated = true;\s*render\(\);[\s\S]*?refreshStartupSharedState\(startupState\.refresh\);\s*refreshFriendNetwork\(\)/
  );
  assert.doesNotMatch(startup, /await refreshFriendNetwork\(\)/);
});

test("concurrent startup readers share one cloud-state request", async () => {
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(localStore, /let sharedStateLoadPromise = null/);
  assert.match(localStore, /let sharedStateLoadScope = ""/);
  assert.match(
    localStore,
    /export function loadSharedState\(\) \{\s*const requestScope = synchronizeAccountStorageScope\(\);\s*if \(!sharedStateLoadPromise \|\| sharedStateLoadScope !== requestScope\) \{[\s\S]*?loadSharedStateOnce\(requestScope\)\.finally/
  );
  assert.match(localStore, /return sharedStateLoadPromise/);
});

test("native startup briefly waits for a current cloud profile before rendering cached account state", async () => {
  const [localStore, app, accountAuth] = await Promise.all([
    readFile("src/data/localStore.mjs", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicAccountAuthLayer.mjs", "utf8")
  ]);

  assert.match(localStore, /STARTUP_SHARED_STATE_WAIT_MS = 1_200/);
  assert.match(
    localStore,
    /export async function loadSharedStateForStartup[\s\S]*?Promise\.race\([\s\S]*?state: loadState\(\), source: "local"/
  );
  assert.match(
    localStore,
    /refresh: initial\.source === "local" \? refresh : null/
  );
  assert.match(
    accountAuth,
    /const localAccountHasHistory = Boolean\([\s\S]*?const startupState = await loadSharedStateForStartup\(\{\s*maxWaitMs: localAccountHasHistory \? 0 : EMPTY_ACCOUNT_CLOUD_WAIT_MS\s*\}\)/
  );
  assert.match(
    accountAuth,
    /const accountStateChanged = hasSharedStateChanged\([\s\S]*?startupState\.state,[\s\S]*?nextState[\s\S]*?\)/
  );
  assert.match(
    app,
    /const localAccountHasHistory = Boolean\([\s\S]*?const startupState = await loadSharedStateForStartup\(\{\s*maxWaitMs: localAccountHasHistory\s*\? CACHED_ACCOUNT_CLOUD_WAIT_MS\s*: EMPTY_ACCOUNT_CLOUD_WAIT_MS\s*\}\)/
  );
  assert.match(app, /refreshStartupSharedState\(startupState\.refresh\)/);
  assert.match(
    app,
    /function refreshStartupSharedState[\s\S]*?hasSharedStateChanged\(state, nextState\)[\s\S]*?state = nextState;[\s\S]*?render\(\)/
  );
});
