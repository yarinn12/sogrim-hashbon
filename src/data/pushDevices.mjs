import {
  accountStorageIdentityFromSession,
  loadStoredAccountSession
} from "./accountAuth.mjs";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout
} from "./fetchTimeout.mjs";

const PUSH_TOKEN_STORAGE_PREFIX = "settle-friends-push-token";
const PUSH_PREFERENCES_STORAGE_PREFIX = "settle-friends-push-preferences";
const ALLOWED_PLATFORMS = new Set(["android", "ios"]);

export function pushPreferenceStorageKey(userId) {
  return `settle-friends-push-enabled:${String(userId ?? "").trim()}`;
}

export function pushPreferencesStorageKey(userId) {
  return `${PUSH_PREFERENCES_STORAGE_PREFIX}:${String(userId ?? "").trim()}`;
}

export function loadStoredPushPreferences(
  userId,
  storage = globalThis.localStorage
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return defaultPushPreferences();

  try {
    const stored = JSON.parse(
      storage?.getItem(pushPreferencesStorageKey(normalizedUserId)) ?? "null"
    );
    return normalizePushPreferences(stored);
  } catch {
    return defaultPushPreferences();
  }
}

export function saveStoredPushPreferences(
  userId,
  preferences,
  storage = globalThis.localStorage
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return false;

  try {
    storage?.setItem(
      pushPreferencesStorageKey(normalizedUserId),
      JSON.stringify(normalizePushPreferences(preferences))
    );
    return true;
  } catch {
    return false;
  }
}

export function storedPushToken(userId, storage = globalThis.localStorage) {
  try {
    return String(
      storage?.getItem(`${PUSH_TOKEN_STORAGE_PREFIX}:${String(userId ?? "").trim()}`) ?? ""
    ).trim();
  } catch {
    return "";
  }
}

export function saveStoredPushToken(
  userId,
  token,
  storage = globalThis.localStorage
) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedToken = normalizePushToken(token);
  if (!normalizedUserId || !normalizedToken) return false;

  try {
    storage?.setItem(
      `${PUSH_TOKEN_STORAGE_PREFIX}:${normalizedUserId}`,
      normalizedToken
    );
    return true;
  } catch {
    return false;
  }
}

export function clearStoredPushToken(
  userId,
  storage = globalThis.localStorage
) {
  try {
    storage?.removeItem(`${PUSH_TOKEN_STORAGE_PREFIX}:${String(userId ?? "").trim()}`);
  } catch {}
}

export async function registerPushDevice(
  config,
  {
    token,
    platform,
    preferences = defaultPushPreferences(),
    appVersion = ""
  },
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const account = currentPushAccount(config);
  const normalizedToken = normalizePushToken(token);
  const normalizedPlatform = String(platform ?? "").trim().toLowerCase();
  if (!account || !normalizedToken || !ALLOWED_PLATFORMS.has(normalizedPlatform)) {
    return { ok: false, reason: "unavailable" };
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.storage.url}/rest/v1/rpc/register_push_device`,
    {
      method: "POST",
      headers: pushHeaders(config, account.accessToken),
      body: JSON.stringify({
        p_token: normalizedToken,
        p_platform: normalizedPlatform,
        p_preferences: normalizePushPreferences(preferences),
        p_app_version: String(appVersion ?? "").trim().slice(0, 32) || null
      })
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = new Error(`Push device registration failed (${response.status})`);
    error.status = response.status;
    error.code = response.status === 401 ? "AUTH_REQUIRED" : "PUSH_REGISTRATION_FAILED";
    throw error;
  }

  return { ok: true, userId: account.userId };
}

export async function disablePushDevice(
  config,
  token,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const account = currentPushAccount(config);
  const normalizedToken = normalizePushToken(token);
  if (!account || !normalizedToken) return { ok: false, reason: "unavailable" };

  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.storage.url}/rest/v1/rpc/disable_push_device`,
    {
      method: "POST",
      headers: pushHeaders(config, account.accessToken),
      body: JSON.stringify({ p_token: normalizedToken })
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = new Error(`Push device disable failed (${response.status})`);
    error.status = response.status;
    error.code = response.status === 401 ? "AUTH_REQUIRED" : "PUSH_DISABLE_FAILED";
    throw error;
  }

  return { ok: true, userId: account.userId };
}

export function defaultPushPreferences() {
  return {
    eventUpdates: true,
    paymentReminders: true
  };
}

function currentPushAccount(config) {
  if (config?.storage?.mode !== "supabase" || !config.storage.url) return null;
  return (
    config.storage.account ??
    accountStorageIdentityFromSession(loadStoredAccountSession())
  );
}

function normalizePushToken(value) {
  const token = String(value ?? "").trim();
  return token.length >= 20 && token.length <= 4096 ? token : "";
}

export function normalizePushPreferences(value) {
  return {
    eventUpdates: value?.eventUpdates !== false,
    paymentReminders: value?.paymentReminders !== false
  };
}

function pushHeaders(config, accessToken) {
  return {
    apikey: config.storage.anonKey,
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json"
  };
}
