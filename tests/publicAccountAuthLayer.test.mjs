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
  assert.match(index, /<script defer src="\.\/src\/vendor\/framer-motion-dom\.js\?pwa_release=446"><\/script>/);
});

test("username repair never blocks the first authenticated paint", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  assert.match(
    layer,
    /setFriendUsername\([\s\S]*?globalThis\.fetch,[\s\S]*?STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS[\s\S]*?\)\.catch\(\(\) => \{\}\);/
  );
  assert.doesNotMatch(layer, /await setFriendUsername\(runtimeConfig, accountProfile\.username/);
});

test("the immediate resume predicate never creates a cloud workspace", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const start = layer.indexOf("function canResumeStoredSessionImmediately");
  const end = layer.indexOf("\n}\n\nasync function reconcileResumedAccountSession", start);
  const predicate = layer.slice(start, end);

  assert.match(predicate, /peekClientSpaceId\(window\.location\.href, window\.localStorage\)/);
  assert.doesNotMatch(predicate, /getActiveCloudSpaceId\(/);
});

test("the slow account connection activates the signed-in workspace before reading state", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const start = layer.indexOf("async function connectAccountToApp(");
  const end = layer.indexOf("\n}\n\nfunction discardFailedInviteContext", start);
  const connection = layer.slice(start, end);

  const activateIndex = connection.indexOf("activateAccountWorkspace(accountWorkspace)");
  const configIndex = connection.indexOf("runtimeConfig = await loadRuntimeConfig()");
  const stateIndex = connection.indexOf("const localAccountState = loadState()");
  assert.ok(activateIndex >= 0 && activateIndex < configIndex);
  assert.ok(configIndex < stateIndex);
});

test("a fresh signup never inherits the previous device owner's name", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const accountGate = layer.slice(
    layer.indexOf("function renderAccountGate("),
    layer.indexOf("function scheduleAccountConfigRetry(")
  );

  assert.match(
    accountGate,
    /name="displayName"[\s\S]*?value="\$\{escapeAttribute\(values\.displayName \?\? ""\)\}"/
  );
  assert.doesNotMatch(accountGate, /loadLocalProfile|previousProfile/);
});

test("a returning session paints local state before remote reconciliation even when its token is expiring", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const setup = layer.slice(
    layer.indexOf("async function setupAccountAuth"),
    layer.indexOf("function isLocalDevelopmentOrigin")
  );
  const reconcile = layer.slice(
    layer.indexOf("async function reconcileResumedAccountSession"),
    layer.indexOf("function lockForAccountSessionChange")
  );

  assert.match(
    setup,
    /!callbackSession &&[\s\S]*?!callbackCode &&[\s\S]*?!callbackType &&[\s\S]*?!recoverySessionActive &&[\s\S]*?!pendingEventInvite &&[\s\S]*?canResumeStoredSessionImmediately\(accountSession\)/
  );
  assert.ok(
    setup.indexOf("resumeAccountLocally(resumedSession)") <
      setup.indexOf("reconcileResumedAccountSession(resumedSession)"),
    "the cached account must become interactive before cloud validation starts"
  );
  const immediateResume = layer.slice(
    layer.indexOf("function canResumeStoredSessionImmediately"),
    layer.indexOf("async function reconcileResumedAccountSession")
  );
  assert.match(
    immediateResume,
    /isFullProfileName\(accountProfile\.displayName\)[\s\S]*?normalizeUsername\(accountProfile\.username\)/
  );
  assert.match(
    immediateResume,
    /accountWorkspaceFromUser\(session\?\.user\)[\s\S]*?activeWorkspaceId === accountWorkspace\.id/
  );
  assert.match(
    immediateResume,
    /!isExpiring\(session\) \|\| refreshToken/,
    "an expiring cached session may resume immediately only when it can refresh in the background"
  );
  assert.match(
    reconcile,
    /restoreAccountSession\(resumedSession\)[\s\S]*?isUnauthorizedAccountError\(error\)[\s\S]*?refreshAccountSession\([\s\S]*?restoreAccountSession\(refreshedSession\)/
  );
  assert.match(
    reconcile,
    /isTransientAccountError\(error\)[\s\S]*?scheduleAccountSessionRefresh\(ACCOUNT_REFRESH_RETRY_MS\)/
  );
});

test("an OAuth callback always clears a spent code when no session is produced", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const callbackStart = layer.indexOf("if (!callbackSession && callbackCode) {");
  const callbackEnd = layer.indexOf("\n  if (callbackSession) {", callbackStart);
  const callbackBranch = layer.slice(callbackStart, callbackEnd);

  assert.ok(callbackStart >= 0, "OAuth callback branch should exist");
  assert.match(callbackBranch, /try\s*\{/);
  assert.match(callbackBranch, /finally\s*\{/);
  assert.match(
    callbackBranch,
    /if \(!callbackSession\) \{[\s\S]*?cleanAuthHash\(callbackFlow\);[\s\S]*?rememberAccountNotice\(/
  );
});

test("a successful OAuth callback still cleans the callback URL after session capture", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(
    layer,
    /if \(callbackSession\) \{[\s\S]*?accountSession = callbackSession;[\s\S]*?cleanAuthHash\(callbackFlow\);/
  );
});

test("signup requires a username and keeps it through validation and account completion", async () => {
  const [layer, auth, schema] = await Promise.all([
    readFile("src/publicAccountAuthLayer.mjs", "utf8"),
    readFile("src/data/accountAuth.mjs", "utf8"),
    readFile("supabase/schema.sql", "utf8")
  ]);

  assert.match(layer, /<span>שם משתמש<\/span>[\s\S]*?name="username"[\s\S]*?required/);
  assert.doesNotMatch(layer, /שם משתמש ייחודי \(לא חובה\)/);
  assert.match(layer, /!normalizeUsername\(username\)/);
  assert.match(layer, /usernameValidationMessage\(username\)/);
  assert.match(layer, /signUpWithPassword\(runtimeConfig, \{[\s\S]*?username,/);
  assert.match(auth, /username: normalizedUsername/);
  assert.match(schema, /new\.raw_user_meta_data ->> 'username'/);
  assert.match(schema, /requested_username ~ '\^\[a-z\]\[a-z0-9_\]\{2,23\}\$'/);
});

test("account gate offers email registration, Google, Apple, sign out and deletion", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /data-account-mode="login"/);
  assert.match(layer, /data-account-mode="signup"/);
  assert.match(layer, /signInWithPassword/);
  assert.match(layer, /signUpWithPassword/);
  assert.match(layer, /החשבון יופעל רק אחרי פתיחת הקישור/);
  assert.match(layer, /normalizeAccountEmail\(email\)/);
  assert.match(layer, /resendSignupConfirmation/);
  assert.match(layer, /data-account-action="resend-verification"/);
  assert.match(layer, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(layer, /@capgo\/capacitor-social-login/);
  assert.match(layer, /signInWithIdToken/);
  assert.match(layer, /window\.google\.accounts\.id\.renderButton/);
  assert.match(layer, /callback: handleWebGoogleCredential/);
  assert.match(layer, /context: "signin"/);
  assert.match(layer, /itp_support: true/);
  assert.match(layer, /use_fedcm_for_button: true/);
  assert.match(layer, /button_auto_select: false/);
  assert.match(layer, /nonce: nonce\.hashed/);
  assert.match(layer, /nonce: webGoogleNonce/);
  assert.doesNotMatch(layer, /accounts\.id\.prompt\(\)/);
  assert.doesNotMatch(layer, /secureOAuthUrl\(googleOAuthUrl\)/);
  assert.doesNotMatch(layer, /scopes: \["openid", "email", "profile"\]/);
  assert.match(layer, /filterByAuthorizedAccounts: false/);
  assert.match(layer, /autoSelectEnabled: false/);
  assert.match(layer, /style: "standard"/);
  assert.doesNotMatch(layer, /style: "bottom"/);
  assert.match(layer, /if \(authBusy \|\| !isNativeAndroid\(\)\) return;\s*setAuthBusy\(true\);\s*try \{\s*await signInWithNativeGoogle\(\)/);
  assert.match(
    layer,
    /accountSession = saveAccountSession\(\s*await signInWithIdToken\(runtimeConfig,[\s\S]*?canResumeOffline\(accountSession, error\)[\s\S]*?resumeAccountLocally\(accountSession\)/
  );
  assert.match(layer, /accountAuthErrorMessage\(error, "google"\)/);
  assert.match(layer, /renderAccountNameCompletionGate\(\{\s*displayName:/);
  assert.match(
    layer,
    /if \(accountSession\?\.user && accountProfileNeedsCompletion\(error\)\) \{[\s\S]*?renderAccountNameCompletionGate/
  );
  assert.match(layer, /אחרי השמירה נמשיך אוטומטית לאירוע מהקישור/);
  assert.match(layer, /hasSavedFullName[\s\S]*type="hidden"/);
  assert.match(layer, /appleOAuthUrl/);
  assert.match(layer, /aria-label="המשך עם Apple"/);
  assert.match(layer, /assets\/sign-in-with-apple-iw\.png/);
  assert.match(
    layer,
    /if \(action === "google"\) \{[\s\S]*?if \(authBusy \|\| !isNativeAndroid\(\)\) return;\s*setAuthBusy\(true\);[\s\S]*?finally \{\s*setAuthBusy\(false\)/
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
  const inviteResolution = accountConnection.indexOf(
    "resolveEventInviteCredentials("
  );
  assert.ok(
    accountConnection.indexOf("runtimeConfig = await loadRuntimeConfig()") <
      inviteResolution &&
      inviteResolution >= 0 &&
      accountConnection.indexOf("runtimeConfig", inviteResolution) > inviteResolution,
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
    restoreSession.indexOf("clearPreviousAccountAfterSwitch(") <
      restoreSession.indexOf("ensureAccountWorkspace(runtimeConfig, nextSession, {"),
    "the previous account must be cleared before a workspace is assigned to the new user"
  );
  assert.match(layer, /STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS = 2_500/);
  assert.match(
    layer,
    /!callbackSession && accountSession\.user && navigator\.onLine === false[\s\S]*?resumeAccountLocally\(accountSession\)/
  );
  assert.match(
    restoreSession,
    /loadAccountUser\([\s\S]*?timeoutMs: STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS[\s\S]*?ensureAccountWorkspace\([\s\S]*?requestTimeoutMs: STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS/
  );
  assert.match(
    restoreSession,
    /previousUserId === nextUserId[\s\S]*?return false;[\s\S]*?clearLocalAccountData\([\s\S]*?previousUserId[\s\S]*?clearAccountWorkspace\(previousSession\.user\)/
  );
  const terminalSessionFailure = layer.slice(
    layer.indexOf("// A terminal session failure invalidates credentials"),
    layer.indexOf("removeSessionValue(AUTH_CHANGED_MARKER)")
  );
  assert.match(terminalSessionFailure, /clearAccountSession\(\);[\s\S]*?accountSession = null;/);
  assert.doesNotMatch(
    terminalSessionFailure,
    /clearLocalAccountData|clearAccountWorkspace/
  );
  assert.match(layer, /data-account-action="ad-privacy">העדפות פרסום/);
  assert.match(layer, /SogrimAds\?\.showPrivacyOptions/);
  assert.match(layer, /rememberProfileRouteBeforeLegalNavigation/);
  assert.match(layer, /url\.searchParams\.set\("action", "profile"\)/);
  assert.match(layer, /data-account-action="delete-account-open"/);
  assert.match(layer, /data-account-action="delete-account-confirm"/);
  assert.match(layer, /clearStoredPushData\(accountSession\?\.user\?\.id\)/);
  assert.match(layer, /clearAllOpenInviteTokens\(\)/);
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
  assert.match(layer, /errorFieldName = ""/);
  assert.match(layer, /aria-invalid="true" aria-describedby="account-auth-feedback"/);
  assert.match(layer, /errorFieldName: validationError\.fieldName/);
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
    /const saveRequest = accountStateChanged[\s\S]*?saveSharedState\(nextState, \{[\s\S]*?suppressRevertNotice: true,[\s\S]*?awaitCloud: forceReload \|\| profileChanged[\s\S]*?\}\)[\s\S]*?mode: "unchanged"/
  );
  assert.ok(
    layer.indexOf("awaitCloud: forceReload || profileChanged") <
      layer.indexOf("if (forceReload || profileChanged)"),
    "OAuth and account-switch reloads must wait for the workspace write"
  );
  assert.match(
    layer,
    /const saveResult = await saveRequest;[\s\S]*?if \(forceReload \|\| profileChanged\) \{[\s\S]*?window\.location\.reload/
  );
  assert.match(
    accountConnection,
    /nextState\.events\.some\(\(event\) => event\.id === verifiedInvitedEventId\)[\s\S]*?\(saveResult\?\.ok \|\| saveResult\?\.partial\)[\s\S]*?clearPendingInviteUrl\(\);[\s\S]*?clearAccountReturnUrl\(\)/
  );
  assert.doesNotMatch(accountConnection, /mergeInviteSnapshotIntoState/);
  assert.doesNotMatch(accountConnection, /attachSharedEventCredentials/);
  assert.ok(
    accountConnection.indexOf("resolveEventInviteCredentials(runtimeConfig") <
      accountConnection.indexOf("readSharedEventState(")
  );
  assert.ok(
    accountConnection.indexOf("readSharedEventState(") <
      accountConnection.indexOf("mergeSharedEventIntoState(")
  );
  assert.ok(
    accountConnection.indexOf("mergeSharedEventIntoState(") <
      accountConnection.indexOf("saveSharedState(nextState,")
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
  assert.match(layer, /isTransientAccountError/);
  assert.match(layer, /const pkce = await createOAuthPkce\(\);/);
  assert.match(layer, /const flowId = createAccountOAuthFlowId\(\);/);
  assert.match(layer, /saveAccountOAuthFlow\(\{/);
  assert.match(layer, /authRedirectUrl\(flowId\)/);
  assert.match(
    layer,
    /callbackFlow\?\.purpose === "oauth"[\s\S]*?callbackFlow\.verifier[\s\S]*?callbackFlowId \? "" : oauthPkceVerifier\(\)/
  );
  assert.doesNotMatch(layer, /const existingVerifier = oauthPkceVerifier\(\)/);
  assert.match(layer, /window\.addEventListener\("online", refreshAccountSessionIfNeeded\)/);
  assert.match(layer, /document\.visibilityState === "visible"/);
  assert.match(layer, /\.profile-setup-panel/);
  assert.match(
    layer,
    /<details class="account-profile-controls" data-account-controls>/
  );
  assert.match(layer, /<summary class="account-profile-controls-summary">/);
  assert.match(layer, /<strong>חשבון ותמיכה<\/strong>/);
  assert.doesNotMatch(
    layer,
    /<details class="account-profile-controls" data-account-controls open/
  );
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
  const [artwork, ledger, serviceWorker, nativeBuilder, accountLayer] = await Promise.all([
    readFile("assets/sign-in-with-apple-iw.png"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("scripts/build-native-web.mjs", "utf8"),
    readFile("src/publicAccountAuthLayer.mjs", "utf8")
  ]);

  assert.deepEqual([...artwork.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(ledger, /\.account-apple-button \{[\s\S]*?background: #000000 !important/);
  assert.match(ledger, /\.account-apple-button-art \{[\s\S]*?max-width: 375px !important/);
  assert.match(serviceWorker, /assets\/sign-in-with-apple-iw\.png/);
  assert.match(nativeBuilder, /assets\/sign-in-with-apple-iw\.png/);
  assert.match(
    accountLayer,
    /if \(action === "apple"\) \{[\s\S]*?\} catch \(error\) \{[\s\S]*?emitOperationFailure\("auth", \{ screen: "auth", error \}\);[\s\S]*?renderAccountGate\(\{[\s\S]*?error: accountAuthErrorMessage\(error, "apple"\)[\s\S]*?\} finally/
  );
});

test("profile name edits update the authenticated cloud account", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /SogrimAccountProfile\?\.updateDisplayName\?\.\(displayName\)/);
  assert.match(app, /Promise\.allSettled/);
  assert.match(app, /הפרופיל נשמר במכשיר\. השלמת הסנכרון תתבצע אוטומטית/);
  assert.match(app, /sharedProfileSaveResult\?\.pending !== true/);
  assert.match(app, /תמונת הפרופיל נשמרה/);
  assert.match(app, /התמונה נשמרה במכשיר\. השלמת הסנכרון תתבצע אוטומטית/);
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
  assert.match(
    layer,
    /function handleAccountSetupFailure\(error\)[\s\S]*?const storedSession = accountSession \?\? loadStoredAccountSession\(\)[\s\S]*?renderAccountRecoveryGate\(\)/
  );
  assert.match(
    layer,
    /if \(canResumeOffline\(accountSession, error\)\) \{[\s\S]*?resumeAccountLocally\(accountSession\)/
  );
  assert.match(
    layer,
    /if \(accountSession && isTransientAccountError\(error\)\) \{[\s\S]*?saveAccountSession\(accountSession\);[\s\S]*?renderAccountRecoveryGate\(\)/
  );
  assert.match(
    layer,
    /accountSession\?\.refresh_token &&[\s\S]*?isUnauthorizedAccountError\(error\)[\s\S]*?refreshAccountSession\([\s\S]*?runtimeConfig,[\s\S]*?accountSession,[\s\S]*?STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS[\s\S]*?saveAccountSession\(accountSession\)[\s\S]*?connectAccountToApp\(accountSession/
  );
  assert.match(
    layer,
    /import \{ isTransientAccountError \} from "\.\/domain\/accountErrors\.mjs";/
  );
  assert.match(
    layer,
    /callbackSession &&[\s\S]*?!accountSession\?\.user &&[\s\S]*?isTransientAccountError\(error\)[\s\S]*?saveAccountSession\(accountSession\);[\s\S]*?renderAccountRecoveryGate\(\);[\s\S]*?return;/
  );
  assert.ok(
    layer.indexOf("callbackSession &&") <
      layer.indexOf("// A terminal session failure invalidates credentials"),
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
      accountCatch.indexOf("// A terminal session failure invalidates credentials")
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
  assert.match(
    layer,
    /\(min-width: 761px\) and \(max-width: 1366px\) and \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.account-auth-brand \{[\s\S]*?safe-area-inset-top/
  );
  assert.match(
    layer,
    /iPad home-screen apps[\s\S]*?\.account-auth-shell \{[\s\S]*?width: min\(calc\(100% - 32px\), 760px\);/
  );
  assert.match(layer, /scroll-padding-block-end: calc\(120px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(layer, /new AbortController\(\)/);
  assert.match(layer, /controller\.abort\(\), 2500/);
  assert.match(layer, /const GOOGLE_IDENTITY_SCRIPT_TIMEOUT_MS = 8_000/);
  assert.match(layer, /script\.remove\(\);[\s\S]*?Google sign-in did not load in time/);
  assert.match(layer, /accountStateChanged[\s\S]*?!saveResult\?\.ok[\s\S]*?ACCOUNT_WORKSPACE_SAVE_FAILED/);
  assert.match(
    layer,
    /\.account-email-toggle \{[\s\S]*?min-height: 48px;[\s\S]*?font-weight: 800;/
  );
});

test("Google sign-in never spends the first browser tap loading its real button", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(
    layer,
    /initializeWebGoogleIdentity\(\)\.catch\(\(\) => \{\}\);[\s\S]*?renderAccountGate/
  );
  assert.match(
    layer,
    /data-account-google-placeholder disabled aria-busy="true"/
  );
  assert.match(
    layer,
    /window\.google\.accounts\.id\.renderButton[\s\S]*?control\.classList\.add\("is-google-ready"\)/
  );
  assert.match(
    layer,
    /webGoogleInitializationPromise[\s\S]*?webGoogleInitializationClientId === clientId[\s\S]*?return webGoogleInitializationPromise/
  );
  assert.doesNotMatch(layer, /data-account-action="google"[\s\S]*?accounts\.id\.prompt/);
  assert.match(
    layer,
    /prepareNativeGoogleSignIn\(\)\.catch\(\(\) => \{\}\);/
  );
  assert.match(
    layer,
    /control\.classList\.contains\("is-google-ready"\)[\s\S]*?control\.classList\.contains\("is-google-rendering"\)/
  );
  assert.match(
    layer,
    /Preserve that exact node[\s\S]*?existingGoogle\.classList\.contains\("is-google-ready"\)/
  );
  assert.match(
    layer,
    /showWebGoogleCompletionState\(\)[\s\S]*?משלימים את הכניסה…/
  );
  assert.match(
    layer,
    /Google has already authenticated this account[\s\S]*?saveAccountSession\(accountSession\);[\s\S]*?renderAccountRecoveryGate\(\)/
  );
  assert.match(
    layer,
    /\.account-google-official iframe \{[\s\S]*?-webkit-tap-highlight-color: transparent !important;/
  );
});

test("a fresh device waits briefly for account history before showing an empty account", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const connection = layer.slice(
    layer.indexOf("async function connectAccountToApp"),
    layer.indexOf("function discardFailedInviteContext")
  );

  assert.match(layer, /const EMPTY_ACCOUNT_CLOUD_WAIT_MS = 8_000/);
  assert.match(connection, /const localAccountState = loadState\(\)/);
  assert.match(
    connection,
    /localAccountState\.events\?\.length[\s\S]*?localAccountState\.groups\?\.length[\s\S]*?localAccountState\.friendContacts\?\.length/
  );
  assert.match(
    connection,
    /maxWaitMs:[\s\S]*?localAccountHasHistory \|\| invitedEventId[\s\S]*?\? 0[\s\S]*?: EMPTY_ACCOUNT_CLOUD_WAIT_MS/
  );
  assert.match(
    connection,
    /resolveEventInviteCredentials\([\s\S]*?timeoutMs: STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS/
  );
  assert.match(
    connection,
    /readSharedEventState\([\s\S]*?timeoutMs: STARTUP_ACCOUNT_REQUEST_TIMEOUT_MS/
  );
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
    /\[ACCOUNT_SESSION_STORAGE_KEY, ACCOUNT_SESSION_SYNC_STORAGE_KEY\][\s\S]*?parseAccountSessionSync\(event\.newValue\)/
  );
  assert.match(
    layer,
    /change\.reason === "switching"[\s\S]*?lockForAccountSessionChange\(\)/
  );
  assert.match(
    layer,
    /event\.key === ACCOUNT_SESSION_STORAGE_KEY[\s\S]*?lockForAccountSessionChange\(\)/
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
    /const saveResult = await saveRequest;[\s\S]*?publishAccountSessionSync\(accountSession\);\s*setSessionValue\(AUTH_CHANGED_MARKER/
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

test("OAuth fragment sessions require a locally bound password recovery flow", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(
    layer,
    /const validRecoveryCallback =[\s\S]*?callbackType === "recovery"[\s\S]*?callbackFlow\?\.purpose === ACCOUNT_RECOVERY_FLOW_PURPOSE;/
  );
  assert.match(
    layer,
    /expectedEmail: validRecoveryCallback \? callbackFlow\.email : ""/
  );
  assert.match(layer, /normalizedSessionEmail !== normalizedExpectedEmail/);
  assert.match(
    layer,
    /purpose: ACCOUNT_RECOVERY_FLOW_PURPOSE,[\s\S]*?email/
  );
  assert.match(layer, /saveAccountRecoverySession\(accountSession\)/);
  assert.match(layer, /!callbackSession && loadAccountRecoverySession\(accountSession\)/);
  assert.match(
    layer,
    /updateAccountPassword\(runtimeConfig, accountSession, password\)[\s\S]*?clearAccountRecoverySession\(\)/
  );
});

test("email delivery gate hides signup and recovery actions until SMTP is ready", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  assert.match(
    layer,
    /runtimeConfig\?\.launch\?\.authEmailDeliveryReady === true/
  );
  assert.match(layer, /emailDeliveryReady \? `<button type="button" data-account-mode="signup"/);
  assert.match(layer, /mode === "login" && emailDeliveryReady[\s\S]*?forgot-password/);
  assert.match(layer, /showVerificationResend && emailDeliveryReady/);
});

test("sign-out removes reusable local credentials before awaiting the network", async () => {
  const auth = await readFile("src/data/accountAuth.mjs", "utf8");
  const signOut = auth.slice(
    auth.indexOf("export async function signOutAccount"),
    auth.indexOf("export function googleOAuthUrl")
  );

  assert.ok(
    signOut.indexOf("clearAccountSession(storage)") < signOut.indexOf("await authRequest")
  );
  assert.ok(
    signOut.indexOf("clearAccountWorkspace(session?.user, storage)") < signOut.indexOf("await authRequest")
  );
});

test("password fields can reveal and hide their value accessibly", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const icons = await readFile("src/uiIcons.mjs", "utf8");

  assert.match(layer, /class="account-password-toggle"/);
  assert.match(layer, /data-account-action="toggle-password"/);
  assert.match(layer, /input\.type = reveal \? "text" : "password"/);
  assert.match(layer, /reveal \? "הסתר סיסמה" : "הצג סיסמה"/);
  assert.match(layer, /\.account-password-toggle:active[\s\S]*?scale\(0\.96\)/);
  assert.match(icons, /eye:/);
  assert.match(icons, /"eye-off":/);
});
