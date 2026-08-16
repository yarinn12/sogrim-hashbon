import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("account auth layer loads before the app and visual layers", async () => {
  const index = await readFile("index.html", "utf8");
  const profileIndex = index.indexOf("publicProfileOverlay.mjs");
  const accountIndex = index.indexOf("publicAccountAuthLayer.mjs");
  const appIndex = index.indexOf("src/app.mjs");
  const designIndex = index.indexOf("publicDesignV2Layer.mjs");

  assert.ok(profileIndex >= 0);
  assert.ok(accountIndex > profileIndex);
  assert.ok(appIndex > accountIndex);
  assert.ok(designIndex > accountIndex);
  assert.match(index, /<script defer src="\.\/src\/vendor\/framer-motion-dom\.js"><\/script>/);
});

test("account gate offers email registration, Google, Apple, sign out and deletion", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /data-account-mode="login"/);
  assert.match(layer, /data-account-mode="signup"/);
  assert.match(layer, /signInWithPassword/);
  assert.match(layer, /signUpWithPassword/);
  assert.match(layer, /googleOAuthUrl/);
  assert.match(layer, /@capgo\/capacitor-social-login/);
  assert.match(layer, /signInWithIdToken/);
  assert.doesNotMatch(layer, /scopes: \["openid", "email", "profile"\]/);
  assert.match(layer, /filterByAuthorizedAccounts: false/);
  assert.match(layer, /autoSelectEnabled: false/);
  assert.match(layer, /if \(isNativeAndroid\(\)\) \{\s*await signInWithNativeGoogle\(\)/);
  assert.match(layer, /renderAccountNameCompletionGate\(\{\s*displayName:/);
  assert.match(layer, /appleOAuthUrl/);
  assert.match(layer, /aria-label="המשך עם Apple"/);
  assert.match(layer, /assets\/sign-in-with-apple-iw\.png/);
  assert.match(
    layer,
    /if \(action === "google"\) \{\s*if \(authBusy\) return;\s*setAuthBusy\(true\);[\s\S]*?finally \{\s*setAuthBusy\(false\)/
  );
  assert.match(
    layer,
    /if \(action === "apple"\) \{\s*if \(authBusy\) return;\s*setAuthBusy\(true\);[\s\S]*?finally \{\s*setAuthBusy\(false\)/
  );
  assert.match(layer, /data-account-action="signout"/);
  assert.match(
    layer,
    /const accountSpaceId = getActiveCloudSpaceId\(runtimeConfig\);[\s\S]*?const accountUserId = String\(sessionToSignOut\?\.user\?\.id[\s\S]*?clearLocalAccountData\(accountSpaceId, accountUserId\)/
  );
  assert.match(
    layer,
    /const displayName = normalizeProfileName\(accountProfile\?\.displayName\)/
  );
  const accountConnection = layer.slice(
    layer.indexOf("async function connectAccountToApp"),
    layer.indexOf("async function updateSignedInAccountDisplayName")
  );
  assert.ok(
    accountConnection.indexOf("runtimeConfig = await loadRuntimeConfig()") <
      accountConnection.indexOf("resolveEventInviteCredentials(runtimeConfig"),
    "a fresh login session must reach private invite redemption"
  );
  assert.doesNotMatch(accountConnection, /previousProfile\?\.displayName/);
  assert.match(layer, /globalThis\.SogrimAccountProfile = Object\.freeze/);
  assert.match(layer, /async function updateSignedInAccountDisplayName/);
  assert.match(layer, /\.\.\.currentMetadata,[\s\S]*?full_name: displayName/);
  assert.match(
    layer,
    /sessionBeforeCallback = loadStoredAccountSession\(\);[\s\S]*?accountSession = callbackSession;/
  );
  assert.match(
    layer,
    /restoreAccountSession\(accountSession, \{[\s\S]*?previousSession: sessionBeforeCallback[\s\S]*?\}\)/
  );
  const restoreSession = layer.slice(
    layer.indexOf("async function restoreAccountSession"),
    layer.indexOf("async function connectAccountToApp")
  );
  assert.ok(
    restoreSession.indexOf("clearPreviousAccountAfterSwitch(previousSession, nextSession)") <
      restoreSession.indexOf("ensureAccountWorkspace(runtimeConfig, nextSession)"),
    "the previous account must be cleared before a workspace is assigned to the new user"
  );
  assert.match(
    restoreSession,
    /previousUserId === nextUserId[\s\S]*?return false;[\s\S]*?clearLocalAccountData\([\s\S]*?previousUserId[\s\S]*?clearAccountWorkspace\(previousSession\.user\)/
  );
  assert.match(
    layer,
    /const invalidUser = invalidSession\?\.user \?\? sessionBeforeCallback\?\.user;[\s\S]*?clearAccountSession\(\);[\s\S]*?clearLocalAccountData\(invalidSpaceId, invalidUserId\);[\s\S]*?clearAccountWorkspace\(invalidUser\)/
  );
  assert.match(layer, /data-account-action="ad-privacy">העדפות פרסום/);
  assert.match(layer, /SogrimAds\?\.showPrivacyOptions/);
  assert.match(layer, /rememberProfileRouteBeforeLegalNavigation/);
  assert.match(layer, /url\.searchParams\.set\("action", "profile"\)/);
  assert.match(layer, /data-account-action="delete-account-open"/);
  assert.match(layer, /data-account-action="delete-account-confirm"/);
  assert.match(layer, /deleteAccount/);
  assert.match(layer, /handleAccountDeletionKeydown/);
  assert.match(layer, /let accountDeleteBusy = false/);
  assert.match(layer, /if \(action === "delete-account-cancel"\) \{\s*if \(accountDeleteBusy\) return;/);
  assert.match(layer, /event\.key === "Escape" && !accountDeleteBusy/);
  assert.match(layer, /function setAccountDeletionBusy\(value\) \{\s*accountDeleteBusy = value;/);
  assert.match(layer, /setAttribute\("inert", ""\)/);
  assert.equal([...layer.matchAll(/gate\.setAttribute\("role", "main"\)/g)].length, 4);
  assert.match(layer, /data-mode="complete-profile"/);
  assert.match(layer, /updateAccountUser/);
  assert.match(layer, /accountFormValidationError/);
  assert.match(layer, /novalidate/);
  assert.match(layer, /handleAccountGateNativeBack/);
  assert.match(layer, /collapseAccountEmailAuth/);
  assert.match(layer, /data-account-auth-status role="status" aria-live="polite"/);
  assert.match(layer, /account-delete-dialog" role="dialog"[\s\S]*?tabindex="-1"/);
  assert.match(layer, /account-feedback-dialog" role="dialog"[\s\S]*?tabindex="-1"/);
  assert.match(layer, /ACCOUNT_SETUP_TIMEOUT_MS = 12_000/);
  assert.match(
    layer,
    /const accountStateChanged = hasSharedStateChanged\([\s\S]*?startupState\.state,[\s\S]*?nextState[\s\S]*?\)/
  );
  assert.match(
    layer,
    /const saveRequest = accountStateChanged[\s\S]*?saveSharedState\(nextState\)[\s\S]*?mode: "unchanged"/
  );
  assert.match(
    layer,
    /if \(forceReload \|\| profileChanged\) \{\s*await saveRequest;[\s\S]*?window\.location\.reload/
  );
  const connectAccountSource = layer.slice(
    layer.indexOf("async function connectAccountToApp"),
    layer.indexOf("async function updateSignedInAccountDisplayName")
  );
  assert.ok(
    connectAccountSource.indexOf("window.location.reload()") <
      connectAccountSource.indexOf("document.getElementById(GATE_ID)?.remove()"),
    "the old account screen must stay covered until an account-switch reload begins"
  );
  assert.match(
    layer,
    /markAccountAuthReady\(\);\s*publishAccountSessionSync\(accountSession\);\s*deliverPendingAccountNotice\(\);\s*saveRequest\.catch\(\(\) => \{\}\)/
  );
  assert.match(layer, /renderAccountRecoveryGate/);
  assert.match(layer, /data-account-retry/);
  assert.match(layer, /ACCOUNT_CONFIG_RETRY_MS = 5_000/);
  assert.match(layer, /addEventListener\("click", retryAccountSetup\)/);
  assert.match(
    layer,
    /accountConfigRetryPromise = setupAccountAuth\(\{ retryConfig: true \}\)/
  );
  assert.doesNotMatch(
    layer.slice(
      layer.indexOf("function renderAccountRecoveryGate"),
      layer.indexOf("function renderAccountNameCompletionGate")
    ),
    /window\.location\.reload/
  );
  assert.match(
    layer,
    /runtimeConfigUsesFallback\(\) && !isLocalDevelopmentOrigin\(\)/
  );
  assert.match(
    layer,
    /window\.location\.protocol === "http:"[\s\S]*\["localhost", "127\.0\.0\.1"\]/
  );
  assert.match(layer, /accountDeleteReturnFocus/);
  assert.match(layer, /ACCOUNT_REFRESH_MARGIN_SECONDS/);
  assert.match(layer, /scheduleAccountSessionRefresh/);
  assert.match(layer, /refreshActiveAccountSession/);
  assert.match(layer, /let accountRefreshGeneration = 0/);
  assert.match(
    layer,
    /const sessionToSignOut = accountSession;\s*const accountUserId = String\([\s\S]*?\)\.trim\(\);\s*accountRefreshGeneration \+= 1;\s*accountSession = null/
  );
  assert.match(
    layer,
    /requestGeneration !== accountRefreshGeneration \|\|\s*accountSession !== previousSession/
  );
  assert.match(layer, /!status \|\| status >= 500/);
  assert.match(layer, /const pkce = await createOAuthPkce\(\);/);
  assert.match(layer, /const flowId = createAccountOAuthFlowId\(\);/);
  assert.match(layer, /saveAccountOAuthFlow\(\{/);
  assert.match(layer, /authRedirectUrl\(flowId\)/);
  assert.match(
    layer,
    /callbackFlow\?\.verifier \|\|\s*\(callbackFlowId \? "" : oauthPkceVerifier\(\)\)/
  );
  assert.doesNotMatch(layer, /const existingVerifier = oauthPkceVerifier\(\)/);
  assert.match(layer, /window\.addEventListener\("online", refreshAccountSessionIfNeeded\)/);
  assert.match(layer, /document\.visibilityState === "visible"/);
  assert.match(layer, /\.profile-setup-panel/);
  assert.match(layer, /class="account-data-links" aria-label="מידע על החשבון"/);
  assert.match(layer, /\.account-data-link[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.ok(
    layer.indexOf('class="account-data-links"') <
      layer.indexOf('class="account-profile-actions"')
  );
  assert.ok(
    layer.indexOf('data-account-action="signout"') <
      layer.indexOf('class="account-danger-zone"')
  );
  assert.ok(
    layer.indexOf('class="account-danger-zone"') <
      layer.indexOf('data-account-action="delete-account-open"')
  );
  assert.match(layer, /class="account-danger-copy"/);
  assert.match(layer, /\.account-danger-zone[\s\S]*?border-top:/);
  assert.match(layer, /icon-192\.png/);
  assert.doesNotMatch(layer, /sogrim-logo-lockup\.png/);
  assert.match(
    layer,
    /href="\.\/privacy\.html" class="account-data-link">מדיניות פרטיות<\/a>/
  );
  assert.match(
    layer,
    /href="\.\/support\.html" class="account-data-link">תמיכה<\/a>/
  );
  assert.match(
    layer,
    /href="\.\/terms\.html" class="account-data-link">תנאי שימוש<\/a>/
  );
  assert.match(
    layer,
    /href="\.\/accessibility\.html" class="account-data-link">הצהרת נגישות<\/a>/
  );
  assert.doesNotMatch(layer, /href="\.\/(?:privacy|support|terms|accessibility|account-deletion)"/);
});

test("Apple authentication uses Apple's approved localized button artwork", async () => {
  const [artwork, ledger, serviceWorker, nativeBuilder] = await Promise.all([
    readFile("assets/sign-in-with-apple-iw.png"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("scripts/build-native-web.mjs", "utf8")
  ]);

  assert.deepEqual([...artwork.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(ledger, /\.account-apple-button \{[\s\S]*?background: #000000 !important/);
  assert.match(ledger, /\.account-apple-button-art \{[\s\S]*?max-width: 375px !important/);
  assert.match(serviceWorker, /assets\/sign-in-with-apple-iw\.png/);
  assert.match(nativeBuilder, /assets\/sign-in-with-apple-iw\.png/);
});

test("profile name edits update the authenticated cloud account", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /SogrimAccountProfile\?\.updateDisplayName\?\.\(displayName\)/);
  assert.match(app, /Promise\.allSettled/);
  assert.match(app, /עדכון החשבון יושלם כשהחיבור יחזור/);
});

test("account gate protects private content and preserves interrupted form work", async () => {
  const [layer, profileOverlay] = await Promise.all([
    readFile("src/publicAccountAuthLayer.mjs", "utf8"),
    readFile("src/publicProfileOverlay.mjs", "utf8")
  ]);

  assert.match(layer, /lockAccountGate\(\)/);
  assert.doesNotMatch(layer, /renderAccountBootGate|account-auth-boot/);
  assert.match(layer, /account-auth-locked/);
  assert.match(layer, /canResumeOffline/);
  assert.match(layer, /function isTransientAccountError\(error\)/);
  assert.match(
    layer,
    /callbackSession &&[\s\S]*?!accountSession\?\.user &&[\s\S]*?isTransientAccountError\(error\)[\s\S]*?saveAccountSession\(accountSession\);[\s\S]*?renderAccountRecoveryGate\(\);[\s\S]*?return;/
  );
  assert.ok(
    layer.indexOf("callbackSession &&") <
      layer.indexOf("const invalidSession = accountSession"),
    "a transient OAuth callback must be retained before invalid-session cleanup"
  );
  assert.match(layer, /values\.email/);
  assert.match(layer, /rememberAccountReturnUrl\(\)/);
  assert.match(layer, /href="\.\/terms\.html"/);
  assert.match(layer, /href="\.\/privacy\.html"/);
  assert.match(layer, /prefers-reduced-motion/);
  assert.match(
    layer,
    /\.account-auth-legal a \{[\s\S]*?min-height: 44px;[\s\S]*?display: inline-flex/
  );
  assert.match(profileOverlay, /const accountAuthLocked =/);
  assert.match(profileOverlay, /const externalDialogOpen =/);
  assert.match(profileOverlay, /\[data-account-feedback-dialog\]/);
  assert.match(profileOverlay, /#public-referral-rewards-dialog/);
  assert.match(
    profileOverlay,
    /if \(app && !accountAuthLocked && !externalDialogOpen\) app\.inert = false/
  );
  assert.match(layer, /ACCOUNT_DELETE_HISTORY_KEY/);
  assert.match(layer, /handleAccountDeletionNativeBack/);
  assert.match(layer, /addEventListener\("popstate", handleAccountDeletionHistoryBack, true\)/);
});

test("a failed event invite never signs out the connected account", async () => {
  const [layer, app] = await Promise.all([
    readFile("src/publicAccountAuthLayer.mjs", "utf8"),
    readFile("src/app.mjs", "utf8")
  ]);
  const accountCatch = layer.slice(
    layer.indexOf("} catch (error) {", layer.indexOf("async function setupAccountAuth")),
    layer.indexOf("removeSessionValue(AUTH_CHANGED_MARKER)")
  );
  const inviteFailureBranch = accountCatch.slice(
    accountCatch.indexOf("isEventInviteError(error)"),
    accountCatch.indexOf("if (canResumeOffline")
  );

  assert.ok(accountCatch.indexOf("isEventInviteError(error)") >= 0);
  assert.ok(
    accountCatch.indexOf("isEventInviteError(error)") <
      accountCatch.indexOf("const invalidSession = accountSession")
  );
  assert.match(inviteFailureBranch, /discardFailedInviteContext\(\)/);
  assert.match(inviteFailureBranch, /ignoreInvite: true/);
  assert.doesNotMatch(inviteFailureBranch, /clearAccountSession|clearLocalAccountData/);
  assert.match(layer, /deliverPendingAccountNotice\(\)/);
  assert.match(app, /addEventListener\("settle-friends:notice", handleExternalNotice\)/);
  assert.match(
    app,
    /function handleExternalNotice\(event\) \{[\s\S]*?notice = message;[\s\S]*?render\(\);/
  );
});

test("account gate prioritizes provider login and progressively reveals email", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /emailAuthExpanded/);
  assert.match(layer, /data-account-action="toggle-email"/);
  assert.match(layer, /aria-controls="account-email-auth"/);
  assert.match(layer, /class="account-email-auth"/);
  assert.match(layer, /providerAvailable/);
  assert.match(layer, /emailAuthExpanded = !googleEnabled && !appleEnabled/);
  assert.match(layer, /runtimeConfig\.launch\?\.googleAuthReady/);
  assert.match(layer, /refreshProviderOptions\(\)\.catch/);
  assert.match(
    layer,
    /focusAccountInput\(document\.getElementById\(GATE_ID\), \{\s*includeMobile: true/
  );
  assert.match(
    layer,
    /input\.scrollIntoView\(\{ block: "center", inline: "nearest" \}\)/
  );
  assert.match(
    layer,
    /@media \(max-width: 760px\)[\s\S]*?\.account-auth-shell \{[\s\S]*?overflow: visible;/
  );
  assert.match(layer, /scroll-padding-block-end: calc\(120px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(layer, /new AbortController\(\)/);
  assert.match(layer, /controller\.abort\(\), 2500/);
});

test("service worker keeps account auth available in the installed app", async () => {
  const sw = await readFile("sw.js", "utf8");
  assert.match(sw, /const CACHE_NAME = "settle-friends-live-v\d+"/);
  assert.match(sw, /"\/src\/data\/accountAuth\.mjs"/);
  assert.match(sw, /"\/src\/data\/pendingInvite\.mjs"/);
  assert.match(sw, /"\/src\/publicAccountAuthLayer\.mjs"/);
});

test("account auth synchronizes completed account switches and sign-out across tabs", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(
    layer,
    /window\.addEventListener\("storage", handleAccountSessionStorageSync\)/
  );
  assert.match(
    layer,
    /event\.key !== ACCOUNT_SESSION_SYNC_STORAGE_KEY[\s\S]*?parseAccountSessionSync\(event\.newValue\)/
  );
  assert.match(
    layer,
    /change\.reason === "signed-in" && change\.userId !== storedUserId/
  );
  assert.match(
    layer,
    /accountSyncReloadScheduled = true;[\s\S]*?accountSession = null;[\s\S]*?lockAccountGate\(\);[\s\S]*?window\.location\.reload\(\)/
  );
  assert.match(
    layer,
    /await saveRequest;\s*publishAccountSessionSync\(accountSession\);\s*setSessionValue\(AUTH_CHANGED_MARKER/
  );
  assert.match(
    layer,
    /clearLocalAccountData\(accountSpaceId, accountUserId\);\s*publishAccountSessionSync\(null, \{ reason: "signed-out" \}\)/
  );
  assert.match(
    layer,
    /globalThis\.SogrimAccountSession = Object\.freeze\(\{\s*refresh: refreshActiveAccountSession/
  );
  assert.match(
    layer,
    /accountSession = saveAccountSession\(\{[\s\S]*?publishAccountSessionSync\(accountSession\);\s*scheduleAccountSessionRefresh\(\)/
  );
});

test("account boundaries clear invite capabilities before another account loads", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  assert.match(
    layer,
    /if \(action === "signout"\)[\s\S]*?clearPendingInviteUrl\(\);[\s\S]*?clearAccountOAuthFlows\(\);/
  );
  assert.match(
    layer,
    /deleteAccount\(runtimeConfig, accountSession\);[\s\S]*?clearPendingInviteUrl\(\);[\s\S]*?clearAccountOAuthFlows\(\);/
  );
});

test("a restored account does not reload the app a second time on cold start", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(
    layer,
    /await connectAccountToApp\(accountSession, \{\s*forceReload: Boolean\(callbackSession\)\s*\}\)/
  );
  assert.doesNotMatch(
    layer,
    /forceReload: Boolean\(callbackSession\) \|\| !sessionValue\(AUTH_CHANGED_MARKER\)/
  );
  assert.match(
    layer,
    /await connectAccountToApp\(accountSession, \{ forceReload: true \}\)/
  );
});
