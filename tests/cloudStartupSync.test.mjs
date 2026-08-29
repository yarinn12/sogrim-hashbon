import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app startup avoids stale or user-visible background cloud writes", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const startup = app.slice(
    app.indexOf("async function hydrateAppForActiveAccount()"),
    app.indexOf("function renderScopedLocalFallback()")
  );

  assert.match(startup, /hasSharedStateChanged\(sharedState, nextState\)/);
  assert.match(
    startup,
    /const startupProfileSaveRequest = shouldSaveJoinedProfile && !startupState\.refresh\s*\? saveSharedState\(state, \{ suppressRevertNotice: true \}\)\s*:\s*null/
  );
  assert.doesNotMatch(startup, /await saveSharedState\(state\)/);
  assert.match(
    startup,
    /appBootHydrated = true;\s*render\(\);[\s\S]*?startupProfileSaveRequest\?\.catch\(\(\) => \{\}\)/
  );
  assert.match(
    startup,
    /const startupRefreshRequest = refreshStartupSharedState\(startupState\.refresh\);\s*const profilePublicationReady = startupState\.refresh\s*\? startupRefreshRequest/
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
    /appBootHydrated = true;\s*render\(\);[\s\S]*?const startupRefreshRequest = refreshStartupSharedState\(startupState\.refresh\);[\s\S]*?refreshFriendNetwork\(\)/
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

test("account bootstrap waits once and app hydration does not repeat the cloud wait", async () => {
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
    /const startupState = await loadSharedStateForStartup\(\{\s*maxWaitMs: 0\s*\}\)/
  );
  assert.doesNotMatch(app, /const CACHED_ACCOUNT_CLOUD_WAIT_MS/);
  assert.doesNotMatch(app, /const EMPTY_ACCOUNT_CLOUD_WAIT_MS/);
  assert.match(app, /refreshStartupSharedState\(startupState\.refresh\)/);
  assert.match(
    app,
    /function refreshStartupSharedState[\s\S]*?const saveRevisionAtRequest = sharedStateSaveRevision\(\);[\s\S]*?if \(saveRevisionAtRequest !== sharedStateSaveRevision\(\)\) return;/
  );
  assert.match(
    localStore,
    /export function sharedStateSaveRevision\(\) \{\s*return sharedStateSaveGeneration;\s*\}/
  );
  assert.match(
    app,
    /function refreshStartupSharedState[\s\S]*?hasSharedStateChanged\(state, nextState\)[\s\S]*?state = nextState;[\s\S]*?render\(\)/
  );
});
