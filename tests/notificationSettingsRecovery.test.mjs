import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/publicNotificationLayer.mjs", import.meta.url), "utf8");
function deferred() {
  let resolve, reject;
  const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}
function harness({ checkPermission = async () => ({ receive: "granted" }), loadConfig = null, register = null, refresh = null, enable = null, disable = null, disableRemote = null } = {}) {
  const registrations = [];
  const preferences = new Map();
  const tokens = new Map();
  const storage = new Map();
  const context = vm.createContext({
    session: { user: { id: "a" } },
    loadStoredAccountSession: () => context.session,
    loadStoredPushPreferences: (userId) => ({ ...(preferences.get(userId) ?? { eventUpdates: userId !== "b", paymentReminders: true }) }),
    saveStoredPushPreferences: (userId, value) => preferences.set(userId, { ...value }),
    storedPushToken: (userId) => tokens.has(userId) ? tokens.get(userId) : `synthetic-notification-token-${userId}`,
    saveStoredPushToken: (userId, token) => tokens.set(userId, token),
    clearStoredPushToken: (userId) => tokens.set(userId, ""),
    pushPreferenceStorageKey: (userId) => `push-enabled:${userId}`,
    localStorage: { getItem: (key) => storage.get(key) ?? "1", setItem: (key, value) => storage.set(key, value) },
    Element: class { constructor(preference, checked) { this.dataset = { notificationPreference: preference }; this.checked = checked; } closest() { return this; } },
    Capacitor: { getPlatform: () => "ios" },
    SogrimNative: { notifications: { available: true, checkPermission, registerIfGranted: async () => {}, enable: () => enable ? enable(context) : Promise.resolve({ receive: "granted" }), disable: () => disable ? disable() : Promise.resolve(true) } },
    SogrimAccountSession: { refresh: () => refresh?.(context) },
    loadRuntimeConfig: () => loadConfig ? loadConfig(context) : Promise.resolve({ storage: { account: { userId: context.session.user.id } } }),
    registerPushDevice: async (config, registration) => {
      registrations.push({ userId: config.storage.account.userId, ...registration });
      return register ? register(config, registration) : { ok: true };
    },
    disablePushDevice: (config, token) => disableRemote ? disableRemote(config, token) : Promise.resolve({ ok: true }),
    document: { querySelector: () => null },
    window: {},
    console
  });
  vm.runInContext(source.slice(source.indexOf("const STYLE_ID")).replace("\nsetupNotificationLayer();", ""), context);
  vm.runInContext("startupReady = true; renderNotificationSettings = () => {};", context);
  return { context, registrations, preferences, storage, tokens };
}

async function drainMicrotasks() { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }

test("a newer preference write cannot be overtaken by an older background registration", async () => {
  const started = deferred(), release = deferred();
  let remotePreference = null;
  const h = harness({ register: async (_config, registration) => {
    if (registration.preferences.eventUpdates) { started.resolve(); await release.promise; }
    remotePreference = registration.preferences.eventUpdates;
    return { ok: true };
  } });
  const old = h.context.syncNotificationPreferences("a", { eventUpdates: true, paymentReminders: true });
  await started.promise;
  h.preferences.set("a", { eventUpdates: false, paymentReminders: true });
  const latest = h.context.syncNotificationPreferences("a", h.preferences.get("a"));
  await drainMicrotasks();
  release.resolve();
  await Promise.all([old, latest]);
  assert.equal(remotePreference, false, "server must finish with the latest preference");
});

test("disabling while registration is in flight leaves the server disabled", async () => {
  const started = deferred(), release = deferred();
  let remoteEnabled = false;
  const h = harness({ register: async () => { started.resolve(); await release.promise; remoteEnabled = true; return { ok: true }; },
    disableRemote: async () => { remoteEnabled = false; return { ok: true }; } });
  const registration = h.context.syncNotificationPreferences("a", { eventUpdates: true, paymentReminders: true });
  await started.promise;
  const disabling = h.context.disableNotifications();
  await drainMicrotasks();
  assert.equal(h.storage.get("push-enabled:a"), "0");
  release.resolve();
  await Promise.all([registration, disabling]);
  assert.equal(remoteEnabled, false, "an older registration must not re-enable a disabled device");
  assert.equal(vm.runInContext("registeredForCurrentAccount", h.context), false);
});

test("a background registration failure after disabling cannot show an enabled-device error", async () => {
  const started = deferred(), release = deferred();
  const h = harness({ register: () => { started.resolve(); return release.promise; } });
  const initialization = h.context.requestNotificationInitialization();
  await started.promise;
  const disabling = h.context.disableNotifications();
  release.reject(Object.assign(new Error("Unavailable"), { status: 503 }));
  await Promise.all([initialization, disabling]);
  assert.equal(h.storage.get("push-enabled:a"), "0");
  assert.equal(vm.runInContext("notificationError", h.context), "");
});

test("a failed queued write does not block the next saved preference", async () => {
  const started = deferred(), release = deferred();
  let attempts = 0;
  const h = harness({ register: () => {
    if (++attempts === 1) { started.resolve(); return release.promise; }
    return { ok: true };
  } });
  const first = h.context.syncNotificationPreferences("a", { eventUpdates: true, paymentReminders: true });
  const failure = assert.rejects(first, { status: 503 });
  await started.promise;
  h.preferences.set("a", { eventUpdates: false, paymentReminders: true });
  const next = h.context.syncNotificationPreferences("a", h.preferences.get("a"));
  release.reject(Object.assign(new Error("Unavailable"), { status: 503 }));
  await failure;
  assert.equal(await next, true);
  assert.equal(h.registrations.at(-1).preferences.eventUpdates, false);
});

test("a queued registration reads current preferences instead of its obsolete snapshot", async () => {
  const started = deferred(), release = deferred();
  let attempts = 0;
  const h = harness({ register: () => {
    if (++attempts === 1) { started.resolve(); return release.promise; }
    return { ok: true };
  } });
  const first = h.context.syncNotificationPreferences("a", { eventUpdates: true, paymentReminders: true });
  await started.promise;
  const obsolete = h.context.syncNotificationPreferences("a", { eventUpdates: true, paymentReminders: true });
  h.preferences.set("a", { eventUpdates: false, paymentReminders: true });
  release.resolve({ ok: true });
  await Promise.all([first, obsolete]);
  assert.equal(h.registrations.at(-1).preferences.eventUpdates, false);
});

test("disable intent is saved before waiting for the native unregister operation", async () => {
  const native = deferred();
  const h = harness({ disable: () => native.promise });
  const request = h.context.disableNotifications();
  assert.equal(h.storage.get("push-enabled:a"), "0");
  assert.equal(await h.context.syncNotificationPreferences("a", { eventUpdates: true }), false);
  native.resolve(true);
  await request;
  assert.equal(h.registrations.length, 0);
});

test("first enable retains a native token delivered before permission promise resolves", async () => {
  const h = harness({ enable: async (context) => {
    await context.handlePushToken({ detail: { token: "synthetic-first-enable-token", platform: "ios" } });
    return { receive: "granted" };
  } });
  h.storage.set("push-enabled:a", "0");
  h.tokens.set("a", "");
  await h.context.enableNotifications();
  assert.equal(h.tokens.get("a"), "synthetic-first-enable-token");
  assert.ok(h.registrations.length > 0, "first enable must connect the token without waiting for another resume");
});

test("superseded token registration does not unset a newer confirmed connection", async () => {
  const config = deferred();
  const h = harness({ loadConfig: () => config.promise });
  const request = h.context.syncNotificationPreferences("a", { eventUpdates: true });
  h.tokens.set("a", "synthetic-rotated-token");
  vm.runInContext('registeredForCurrentAccount = true;', h.context);
  config.resolve({ storage: { account: { userId: "a" } } });
  assert.equal(await request, null, "null explicitly denotes superseded, not failure or success");
  assert.equal(vm.runInContext("registeredForCurrentAccount", h.context), true);
  assert.equal(h.registrations.length, 0);
});

test("an old token failure cannot overwrite the current token's status", async () => {
  const started = deferred(), release = deferred();
  const h = harness({ register: () => { started.resolve(); return release.promise; } });
  const request = h.context.handlePushToken({ detail: { token: "synthetic-old-token", platform: "ios" } });
  await started.promise;
  h.tokens.set("a", "synthetic-rotated-token");
  vm.runInContext('registeredForCurrentAccount = true; notificationError = "current-token-status";', h.context);
  release.reject(Object.assign(new Error("Unavailable"), { status: 503 }));
  await request;
  assert.equal(vm.runInContext("registeredForCurrentAccount", h.context), true);
  assert.equal(vm.runInContext("notificationError", h.context), "current-token-status");
});

test("a preference RPC rejected after token rotation is superseded rather than a connection error", async () => {
  const started = deferred(), release = deferred();
  const h = harness({ register: () => { started.resolve(); return release.promise; } });
  vm.runInContext('permissionState = "granted";', h.context);
  const request = h.context.handleNotificationPreferenceChange({ target: new h.context.Element("eventUpdates", false), preventDefault() {}, stopImmediatePropagation() {} });
  await started.promise;
  h.tokens.set("a", "synthetic-rotated-token");
  vm.runInContext('registeredForCurrentAccount = true;', h.context);
  release.reject(Object.assign(new Error("Unavailable"), { status: 503 }));
  await request;
  assert.equal(vm.runInContext("registeredForCurrentAccount", h.context), true);
  assert.equal(vm.runInContext("notificationError", h.context), "");
});

test("locally expired identity refreshes before registering instead of waiting for an HTTP 401", async () => {
  let refreshes = 0;
  const h = harness({
    loadConfig: () => Promise.resolve({ storage: { mode: "supabase", ...(refreshes ? { account: { userId: "a" } } : {}) } }),
    refresh: (context) => { refreshes += 1; context.session = { access_token: "synthetic-refreshed-token", user: { id: "a" } }; return Promise.resolve(context.session); }
  });
  assert.equal(await h.context.syncNotificationPreferences("a", { eventUpdates: true, paymentReminders: true }), true);
  assert.equal(refreshes, 1);
  assert.equal(h.registrations.length, 1);
});

test("refresh cannot turn an expired account A write into an account B request", async () => {
  const h = harness({
    loadConfig: () => Promise.resolve({ storage: { mode: "supabase" } }),
    refresh: (context) => { context.session = { access_token: "synthetic-token-b", user: { id: "b" } }; return Promise.resolve(context.session); }
  });
  await assert.rejects(h.context.syncNotificationPreferences("a", { eventUpdates: true }), { code: "AUTH_REQUIRED" });
  assert.equal(h.registrations.length, 0);
});

test("a preference failure from account A cannot clear account B's busy state or error", async () => {
  const started = deferred(), registration = deferred(), enabling = deferred();
  const h = harness({ register: () => { started.resolve(); return registration.promise; }, enable: () => enabling.promise });
  vm.runInContext('permissionState = "granted";', h.context);
  const change = h.context.handleNotificationPreferenceChange({ target: new h.context.Element("eventUpdates", false), preventDefault() {}, stopImmediatePropagation() {} });
  await started.promise;
  h.context.session = { user: { id: "b" } };
  const enableB = h.context.enableNotifications();
  vm.runInContext('notificationError = "account-b-message";', h.context);
  registration.reject(Object.assign(new Error("Unavailable"), { status: 503 }));
  await change;
  const observed = vm.runInContext('({busy:notificationBusy,error:notificationError})', h.context);
  enabling.resolve({ receive: "denied" });
  await enableB;
  assert.equal(observed.busy, true);
  assert.equal(observed.error, "account-b-message");
});

test("a later initialization signal is not lost while a previous account check is in flight", async () => {
  const permission = deferred();
  let checks = 0;
  const h = harness({ checkPermission: () => ++checks === 1 ? permission.promise : Promise.resolve({ receive: "granted" }) });
  const first = h.context.requestNotificationInitialization();
  h.context.session = { user: { id: "b" } };
  assert.equal(h.context.requestNotificationInitialization(), first, "overlapping callers share one ordered recovery");
  permission.resolve({ receive: "granted" });
  await first;
  assert.equal(checks, 2);
  assert.deepEqual(h.registrations.map(({ userId }) => userId), ["b"]);
  assert.equal(h.registrations[0].preferences.eventUpdates, false);
});

test("early notification recovery does not perform work before the first interactive screen", async () => {
  let checks = 0;
  const h = harness({ checkPermission: async () => { checks += 1; return { receive: "granted" }; } });
  vm.runInContext("startupReady = false;", h.context);
  assert.equal(await h.context.requestNotificationInitialization(), false);
  assert.equal(checks, 0);
  assert.equal(h.registrations.length, 0);
});

test("push preferences captured for one account are not registered using another account's config", async () => {
  const config = deferred();
  const h = harness({ loadConfig: () => config.promise });
  const request = h.context.registerPushDeviceWithAccountRecovery("a", {
    token: "synthetic-notification-token-a", platform: "ios", preferences: { eventUpdates: false }
  });
  const rejected = assert.rejects(request, { code: "AUTH_REQUIRED" });
  h.context.session = { user: { id: "b" } };
  config.resolve({ storage: { account: { userId: "b" } } });
  await rejected;
  assert.equal(h.registrations.length, 0);
});

test("a late registration reply cannot mark the next account's notifications as registered", async () => {
  const registration = deferred();
  const started = deferred();
  const h = harness({ register: () => { started.resolve(); return registration.promise; } });
  const request = h.context.syncNotificationPreferences("a", { eventUpdates: false, paymentReminders: true });
  await started.promise;
  h.context.session = { user: { id: "b" } };
  registration.resolve({ ok: true });
  assert.equal(await request, false);
  assert.equal(vm.runInContext("registeredForCurrentAccount", h.context), false);
});

test("a rejected access token still refreshes and retries registration for the same account", async () => {
  let attempts = 0;
  let refreshes = 0;
  const h = harness({
    register: () => {
      if (++attempts === 1) throw Object.assign(new Error("Expired token"), { status: 401 });
      return { ok: true };
    },
    refresh: (context) => {
      refreshes += 1;
      context.session = { access_token: "synthetic-refreshed-token", user: { id: "a" } };
      return Promise.resolve(context.session);
    }
  });
  assert.equal(await h.context.syncNotificationPreferences("a", { eventUpdates: false, paymentReminders: true }), true);
  assert.equal(refreshes, 1);
  assert.equal(attempts, 2);
  assert.deepEqual(h.registrations.map(({ userId }) => userId), ["a", "a"]);
});

test("repeated recovery signals coalesce to one fresh pass instead of being lost or looping", async () => {
  const permission = deferred();
  let checks = 0;
  const h = harness({ checkPermission: () => ++checks === 1 ? permission.promise : Promise.resolve({ receive: "granted" }) });
  const request = h.context.requestNotificationInitialization();
  for (let index = 0; index < 10; index += 1) h.context.requestNotificationInitialization();
  permission.resolve({ receive: "granted" });
  await request;
  assert.equal(checks, 2);
  assert.equal(h.registrations.length, 2);
});

test("a subsequent online/resume recovery still resends stored preferences after a server failure", async () => {
  let attempts = 0;
  const h = harness({ register: () => {
    if (++attempts === 1) throw Object.assign(new Error("Unavailable"), { status: 503 });
    return { ok: true };
  } });
  await h.context.requestNotificationInitialization();
  await h.context.requestNotificationInitialization();
  assert.equal(attempts, 2);
  assert.equal(vm.runInContext("registeredForCurrentAccount", h.context), true);
});
