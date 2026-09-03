import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("native apps register push permissions without prompting on startup", async () => {
  const [
    packageJson,
    config,
    bridge,
    appDelegate,
    entitlements,
    manifest,
    mainActivity,
    capabilitiesPlugin,
    androidBuild
  ] = await Promise.all([
      readFile("package.json", "utf8").then(JSON.parse),
      readFile("capacitor.config.json", "utf8").then(JSON.parse),
      readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
      readFile("ios/App/App/AppDelegate.swift", "utf8"),
      readFile("ios/App/App/App.entitlements", "utf8"),
      readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
      readFile(
        "android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java",
        "utf8"
      ),
      readFile(
        "android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java",
        "utf8"
      ),
      readFile("android/app/build.gradle", "utf8")
    ]);

  assert.ok(packageJson.dependencies["@capacitor/push-notifications"]);
  assert.deepEqual(config.plugins.PushNotifications.presentationOptions, [
    "badge",
    "sound",
    "alert",
    "banner",
    "list"
  ]);
  assert.match(bridge, /checkPermissions/);
  assert.match(bridge, /requestPermissions/);
  assert.match(bridge, /registerIfGranted/);
  assert.match(bridge, /pushNotificationActionPerformed/);
  assert.match(bridge, /notificationTargetFromPayload/);
  assert.match(bridge, /notification\?\.data\?\.actionUrl/);
  assert.match(bridge, /actionUrl && nativeDestination\(actionUrl\)/);
  assert.match(
    bridge,
    /openNativeUrl\(url, \{[\s\S]*?notification: action\?\.notification \?\? null/
  );
  assert.match(
    bridge,
    /const requestKey = activityId \? `\$\{url\}#\$\{activityId\}` : url/
  );
  assert.match(
    bridge,
    /requestKey === lastOpenedRequestKey && now - lastOpenedAt < 1500/
  );
  assert.match(bridge, /resolveAndroidPushAvailability/);
  assert.match(bridge, /available \? pushPlugin : null/);
  assert.match(bridge, /if \(available\) setupPushNotificationListeners/);
  assert.match(mainActivity, /registerPlugin\(SogrimCapabilitiesPlugin\.class\)/);
  assert.match(capabilitiesPlugin, /BuildConfig\.FIREBASE_PUSH_CONFIGURED/);
  assert.match(capabilitiesPlugin, /result\.put\("pushNotifications"/);
  assert.match(androidBuild, /firebasePushConfigured = file\('google-services\.json'\)\.exists\(\)/);
  assert.match(androidBuild, /buildConfig = true/);
  assert.match(androidBuild, /buildConfigField "boolean", "FIREBASE_PUSH_CONFIGURED"/);
  assert.match(appDelegate, /capacitorDidRegisterForRemoteNotifications/);
  assert.match(appDelegate, /capacitorDidFailToRegisterForRemoteNotifications/);
  assert.doesNotMatch(entitlements, /aps-environment/);
  assert.ok(!config.ios.includePlugins.includes("@capacitor/push-notifications"));
  assert.match(manifest, /default_notification_channel_id/);
  assert.match(manifest, /default_notification_icon/);
});

test("notification preferences are explicit, account scoped, and sign-out safe", async () => {
  const [index, layer, accountLayer, schema, applySchema, serviceWorker] =
    await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/publicNotificationLayer.mjs", "utf8"),
      readFile("src/publicAccountAuthLayer.mjs", "utf8"),
      readFile("supabase/schema.sql", "utf8"),
      readFile("scripts/apply-supabase-schema.mjs", "utf8"),
      readFile("sw.js", "utf8")
    ]);

  assert.match(index, /publicNotificationLayer\.mjs/);
  assert.match(layer, /data-notification-action="\$\{view\.action\}"/);
  assert.match(layer, /data-notification-preference="\$\{key\}"/);
  assert.match(layer, /loadStoredPushPreferences/);
  assert.match(layer, /saveStoredPushPreferences/);
  assert.match(layer, /syncNotificationPreferences/);
  assert.match(layer, /class="notification-master-control"/);
  assert.match(layer, /role="switch"/);
  assert.match(layer, /aria-checked=/);
  assert.match(layer, /עדכונים באירועים/);
  assert.match(layer, /תזכורות לתשלום/);
  assert.match(layer, /buttonLabel: "הפעל התראות"/);
  assert.match(layer, /prepareSignOut/);
  assert.match(layer, /NATIVE_CAPABILITIES_EVENT/);
  assert.match(layer, /NATIVE_RESUME_EVENT/);
  assert.match(layer, /addEventListener\("online", requestNotificationInitialization\)/);
  assert.match(layer, /addEventListener\(NATIVE_RESUME_EVENT, requestNotificationInitialization\)/);
  assert.match(layer, /if \(notificationInitializationRequest\)/);
  assert.match(layer, /retryDisabledNotificationCleanup\(session\.user\.id\)/);
  assert.match(layer, /async function retryDisabledNotificationCleanup/);
  assert.match(layer, /clearStoredPushToken\(userId\)/);
  assert.match(layer, /function registerPushDeviceWithAccountRecovery/);
  assert.match(layer, /SogrimAccountSession\?\.refresh\?\.\(\)/);
  assert.match(layer, /Account changed during push recovery/);
  assert.match(layer, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(layer, /requestPermissions\(\)/);
  assert.match(accountLayer, /SogrimNotifications\?\.prepareSignOut/);
  assert.match(schema, /create table if not exists public\.push_devices/);
  assert.match(
    schema,
    /create table if not exists public\.event_activity_notifications/
  );
  assert.match(schema, /alter table public\.push_devices force row level security/);
  assert.match(schema, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /function public\.register_push_device/);
  assert.match(schema, /function public\.disable_push_device/);
  assert.match(schema, /create table if not exists public\.payment_reminders/);
  assert.match(schema, /function public\.reserve_payment_reminder/);
  assert.match(schema, /alter table public\.payment_reminders force row level security/);
  assert.match(
    schema,
    /grant execute on function public\.reserve_payment_reminder\([\s\S]+?\) to service_role/
  );
  assert.doesNotMatch(
    schema,
    /grant execute on function public\.reserve_payment_reminder\([^;]+?\) to authenticated/
  );
  assert.match(applySchema, /push_devices_ready/);
  assert.match(applySchema, /payment_reminders_ready/);
  assert.match(applySchema, /payment_reminder_function_locked/);
  assert.match(serviceWorker, /settle-friends-live-v\d+/);
  assert.match(serviceWorker, /notificationInbox\.mjs/);
  assert.match(serviceWorker, /publicNotificationLayer\.mjs/);
  assert.match(serviceWorker, /paymentReminders\.mjs/);
  assert.match(serviceWorker, /notificationTargets\.mjs/);
});

test("payment reminder cooldown reservation is atomic under concurrent sends", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const start = schema.indexOf(
    "create or replace function public.reserve_payment_reminder"
  );
  const end = schema.indexOf("$$;", start);
  const reservationFunction = schema.slice(start, end);
  const lockIndex = reservationFunction.indexOf("pg_advisory_xact_lock");
  const readIndex = reservationFunction.indexOf("select reminder.sent_at");
  const insertIndex = reservationFunction.indexOf(
    "insert into public.payment_reminders"
  );

  assert.ok(start >= 0, "the reminder reservation function must exist");
  assert.ok(lockIndex >= 0, "the reminder tuple must be transaction-locked");
  assert.ok(
    lockIndex < readIndex && readIndex < insertIndex,
    "the lock must cover the cooldown read and reservation insert"
  );
  assert.match(
    reservationFunction,
    /normalized_event_id \|\| ':' \|\|[\s\S]*?normalized_transfer_id \|\| ':' \|\|[\s\S]*?p_recipient_user_id::text/
  );
});

test("payment reminders are visible only for a real online payer who owes the account", async () => {
  const [app, server, route, ledger, icons] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/server/paymentReminders.mjs", "utf8"),
    readFile("server.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicCommandIconLayer.mjs", "utf8")
  ]);

  assert.match(app, /function paymentReminderEligibility/);
  assert.match(app, /data-action="send-payment-reminder"/);
  assert.match(app, /transfer\?\.toParticipantId !== currentAccountParticipantId/);
  assert.match(app, /accountUserIdFromParticipantId/);
  assert.match(app, /function sendTransferReminder/);
  assert.match(server, /REMINDER_COOLDOWN_MINUTES = 12 \* 60/);
  assert.match(server, /Only the payment recipient can send this reminder/);
  assert.match(server, /loadAuthoritativeSharedEvent/);
  assert.match(server, /preferences\?\.paymentReminders !== false/);
  assert.match(route, /\/api\/notifications\/payment-reminder/);
  assert.match(route, /\/api\/notifications\/event-activity/);
  assert.match(ledger, /\.transfer-action-buttons/);
  assert.match(ledger, /\.transfer-reminder-button/);
  assert.match(icons, /"send-payment-reminder"/);
});

test("app consumes a notification destination only after account state hydration", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const bootstrap = app.slice(app.indexOf("function bootstrapApp()"));

  assert.match(app, /NATIVE_DESTINATION_EVENT/);
  assert.match(app, /function openNotificationTargetFromUrl/);
  assert.match(
    app,
    /url\.searchParams\.has\("openEvent"\)[\s\S]*cleanNotificationTargetUrl/
  );
  assert.match(app, /target\.view === "summary" \? "settlement" : "event"/);
  assert.match(app, /function handleNativeDestinationRequest/);
  assert.ok(
    bootstrap.indexOf("await hydrateIncomingSharedEvent(sharedState)") <
      bootstrap.indexOf("openNotificationTargetFromUrl")
  );
});

test("native notification taps wait for authoritative event state before navigation", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const handler = app.slice(
    app.indexOf("function handleNativeDestinationRequest"),
    app.indexOf("function persistState", app.indexOf("function handleNativeDestinationRequest"))
  );

  assert.match(handler, /if \(!target\) return;[\s\S]*?event\.preventDefault\(\)/);
  assert.match(
    handler,
    /openNativeNotificationDestinationAfterSync\([\s\S]*?event\.detail\?\.notification/
  );
  assert.match(
    handler,
    /notification \?\? \{ data: target \}[\s\S]*?openNotificationTargetFromUrl\(destination\)/
  );
  assert.ok(
    handler.indexOf("const ready = await refreshIncomingPushState") <
      handler.indexOf("openNotificationTargetFromUrl(destination)"),
    "a native push tap must hydrate before opening its event"
  );
  assert.match(handler, /window\.location\.replace\(destination\)/);
});

test("native resume refreshes shared state without duplicate concurrent syncs", async () => {
  const [app, bridge] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8")
  ]);

  assert.match(bridge, /addListener\?\.\("appStateChange"/);
  assert.match(bridge, /settle-friends:native-resume/);
  assert.match(app, /addEventListener\(NATIVE_RESUME_EVENT, requestResumeSync\)/);
  assert.match(
    app,
    /if \(resumeSyncRequest\) \{[\s\S]*?force[\s\S]*?queueForcedResumeSync\(\{ includeSecondary \}\)[\s\S]*?: resumeSyncRequest;/
  );
  assert.match(app, /loadSharedState\(\)/);
  assert.match(
    app,
    /function requestResumeSync[\s\S]*?const saveRevisionAtRequest = sharedStateSaveRevision\(\);[\s\S]*?if \(saveRevisionAtRequest !== sharedStateSaveRevision\(\)\) \{[\s\S]*?queueForcedResumeSync\(\{ includeSecondary: false \}\);/
  );
  assert.match(app, /hasSharedStateChanged\(state, nextState\)/);
  assert.match(app, /document\.visibilityState === "visible"/);
});

test("a forced inbox refresh queues one follow-up request instead of dropping it", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const refresh = app.slice(
    app.indexOf("async function refreshNotificationInbox"),
    app.indexOf("function notificationUnreadCount")
  );

  assert.match(refresh, /notificationInboxRequest && force/);
  assert.match(refresh, /notificationInboxRefreshQueued = true/);
  assert.match(refresh, /const pendingRequest = notificationInboxRequest/);
  assert.match(
    refresh,
    /pendingRequest\.then\(\(\) => \{[\s\S]*?notificationInboxRefreshQueued = false;[\s\S]*?return refreshNotificationInbox\(\)/
  );
});
