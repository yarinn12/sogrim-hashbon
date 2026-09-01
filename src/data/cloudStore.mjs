import { fetchWithTimeout } from "./fetchTimeout.mjs";

const snapshotVersions = new Map();
const snapshotObserverVersions = new Map();
export const RECOVERED_MEMBER_SPACE_KEY = "member_access_recovery_v1_key_0001";

export class CloudStateConflictError extends Error {
  constructor() {
    super("Cloud state changed on another device");
    this.name = "CloudStateConflictError";
    this.code = "CLOUD_STATE_CONFLICT";
  }
}

export class CloudStateAuthError extends Error {
  constructor(message = "Cloud account session expired") {
    super(message);
    this.name = "CloudStateAuthError";
    this.code = "CLOUD_STATE_AUTH_EXPIRED";
    this.status = 401;
  }
}

export async function loadCloudState(config, fallbackState, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return fallbackState;

  const state = await readCloudState(config, fetchImpl);
  if (state) return state;

  // Production no longer allows clients to create ownerless workspaces. A
  // signed-out browser can still carry an old space id in local storage, so a
  // missing row must stay local instead of retrying a guaranteed 401 every
  // time the foreground sync runs.
  if (!config.storage.account?.accessToken) return fallbackState;

  // A newly authenticated account can reach the cloud loader before the
  // account participant has been added to its fresh local state. The server
  // correctly rejects that empty personal snapshot. Do not keep retrying an
  // invalid insert; the account connection flow will add the participant and
  // persist the first valid snapshot immediately afterwards.
  if (
    isAccountOwnedSpace(config) &&
    !isValidPersonalWorkspaceState(config, fallbackState)
  ) {
    return fallbackState;
  }

  await saveCloudState(config, fallbackState, fetchImpl);
  return fallbackState;
}

export async function readCloudState(config, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return null;

  const response = await fetchWithTimeout(fetchImpl, snapshotReadUrl(config), {
    headers: cloudHeaders(config)
  });

  if (!response.ok) throw cloudResponseError(response, "Cloud state unavailable");

  const rows = await response.json();
  const state = rows[0]?.state;
  if (state) {
    rememberSnapshotVersion(config, rows[0]?.updated_at);
    return state;
  }

  forgetSnapshotVersion(config);
  return null;
}

export async function readCloudStateIfChanged(
  config,
  fetchImpl = fetch,
  { observerKey = "" } = {}
) {
  if (config.storage?.mode !== "supabase") {
    return { changed: false, missing: false, state: null };
  }

  const normalizedObserverKey = String(observerKey ?? "").trim();
  const knownVersion = normalizedObserverKey
    ? snapshotObserverVersions.get(
        snapshotObserverVersionKey(config, normalizedObserverKey)
      )
    : snapshotVersions.get(snapshotVersionKey(config));
  if (!knownVersion) {
    const state = await readCloudState(config, fetchImpl);
    rememberSnapshotObserverVersion(config, normalizedObserverKey);
    return {
      changed: Boolean(state),
      missing: !state,
      state
    };
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    snapshotVersionReadUrl(config),
    { headers: cloudHeaders(config) }
  );
  if (!response.ok) {
    throw cloudResponseError(response, "Cloud state version unavailable");
  }

  const rows = await response.json();
  const updatedAt = String(rows[0]?.updated_at ?? "").trim();
  if (!updatedAt) {
    forgetSnapshotVersion(config);
    forgetSnapshotObserverVersion(config, normalizedObserverKey);
    return { changed: true, missing: true, state: null };
  }
  if (updatedAt === knownVersion) {
    return { changed: false, missing: false, state: null };
  }

  const state = await readCloudState(config, fetchImpl);
  rememberSnapshotObserverVersion(config, normalizedObserverKey);
  return {
    changed: true,
    missing: !state,
    state
  };
}

export async function saveCloudState(config, state, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return;

  if (!config.storage.spaceKey) {
    throw new Error("Cloud space key is missing");
  }

  const currentVersion = snapshotVersions.get(snapshotVersionKey(config));
  const isUpdate = Boolean(currentVersion);
  if (isSharedEventSpace(config)) {
    if (!isUpdate) throw new CloudStateConflictError();
    await saveSharedEventStateAtomically(
      config,
      state,
      currentVersion,
      fetchImpl
    );
    return;
  }

  const nextVersion = new Date().toISOString();
  const response = await fetchWithTimeout(
    fetchImpl,
    isUpdate ? snapshotUpdateUrl(config, currentVersion) : snapshotWriteUrl(config),
    {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        ...cloudHeaders(config),
        prefer: "return=representation"
      },
      body: JSON.stringify({
        id: config.storage.spaceId,
        state,
        updated_at: nextVersion,
        ...(!isUpdate && isAccountOwnedSpace(config)
          ? { owner_user_id: config.storage.account.userId }
          : {}),
        ...(isUpdate
          ? {}
          : {
              access_key_hash: await hashSpaceKey(config.storage.spaceKey),
              ...(config.storage.snapshotKind
                ? { snapshot_kind: config.storage.snapshotKind }
                : {})
            })
      })
    }
  );

  if (!response.ok) throw cloudResponseError(response, "Cloud state save failed");

  const rows = await response.json();
  if (isUpdate && (!Array.isArray(rows) || rows.length === 0)) {
    throw new CloudStateConflictError();
  }

  rememberSnapshotVersion(config, rows?.[0]?.updated_at ?? nextVersion);
}

export async function readAccessibleSharedCloudStates(config, fetchImpl = fetch) {
  if (
    config.storage?.mode !== "supabase" ||
    !config.storage.account?.accessToken
  ) return [];

  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.storage.url}/rest/v1/${encodeURIComponent(config.storage.table)}` +
      `?snapshot_kind=eq.shared_event&select=id,state,updated_at&order=updated_at.desc`,
    { headers: cloudHeaders(config) }
  );
  if (!response.ok) {
    throw cloudResponseError(response, "Shared event recovery unavailable");
  }

  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && row?.state)
    .map((row) => {
      rememberSnapshotVersion(
        {
          ...config,
          storage: {
            ...config.storage,
            spaceId: row.id,
            spaceKey: RECOVERED_MEMBER_SPACE_KEY,
            snapshotKind: "shared_event"
          }
        },
        row.updated_at
      );
      return row;
    });
}

async function saveSharedEventStateAtomically(
  config,
  state,
  currentVersion,
  fetchImpl
) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config.storage.url}/rest/v1/rpc/update_shared_event_snapshot`,
    {
      method: "POST",
      headers: cloudHeaders(config),
      body: JSON.stringify({
        p_snapshot_id: config.storage.spaceId,
        p_space_key: config.storage.spaceKey,
        p_expected_updated_at: currentVersion,
        p_state: state
      })
    }
  );
  if (!response.ok) throw cloudResponseError(response, "Shared event save failed");

  const result = await response.json().catch(() => null);
  if (result?.status === "conflict") throw new CloudStateConflictError();
  if (result?.status !== "updated" || !result?.updatedAt) {
    throw new Error("Shared event save returned an invalid response");
  }
  rememberSnapshotVersion(config, result.updatedAt);
}

function snapshotReadUrl(config) {
  return `${snapshotWriteUrl(config)}?id=eq.${encodeURIComponent(config.storage.spaceId)}&select=state,updated_at`;
}

function snapshotVersionReadUrl(config) {
  return `${snapshotWriteUrl(config)}?id=eq.${encodeURIComponent(config.storage.spaceId)}&select=updated_at`;
}

function snapshotUpdateUrl(config, currentVersion) {
  return `${snapshotWriteUrl(config)}?id=eq.${encodeURIComponent(config.storage.spaceId)}&updated_at=eq.${encodeURIComponent(currentVersion)}&select=updated_at`;
}

function snapshotWriteUrl(config) {
  return `${config.storage.url}/rest/v1/${encodeURIComponent(config.storage.table)}`;
}

function cloudHeaders(config) {
  const authorization = config.storage.account?.accessToken || config.storage.anonKey;
  return {
    apikey: config.storage.anonKey,
    authorization: `Bearer ${authorization}`,
    "x-space-key": config.storage.spaceKey,
    "content-type": "application/json"
  };
}

function isAccountOwnedSpace(config) {
  const account = config?.storage?.account;
  return Boolean(
    account?.userId &&
    account?.accessToken &&
    account?.spaceId === config?.storage?.spaceId
  );
}

function isValidPersonalWorkspaceState(config, state) {
  const expectedParticipantId = `account-${config.storage.account.userId}`;
  return Boolean(
    state &&
      state.currentParticipantId === expectedParticipantId &&
      Array.isArray(state.participants) &&
      state.participants.some(
        (participant) => participant?.id === expectedParticipantId
      )
  );
}

function isSharedEventSpace(config) {
  return config?.storage?.snapshotKind === "shared_event";
}

function snapshotVersionKey(config) {
  return `${config.storage.url}/${config.storage.table}/${config.storage.spaceId}`;
}

function snapshotObserverVersionKey(config, observerKey) {
  return `${observerKey}\u0000${snapshotVersionKey(config)}`;
}

function rememberSnapshotObserverVersion(config, observerKey) {
  if (!observerKey) return;
  const version = snapshotVersions.get(snapshotVersionKey(config));
  if (!version) return;
  snapshotObserverVersions.set(
    snapshotObserverVersionKey(config, observerKey),
    version
  );
}

function forgetSnapshotObserverVersion(config, observerKey) {
  if (!observerKey) return;
  snapshotObserverVersions.delete(
    snapshotObserverVersionKey(config, observerKey)
  );
}

function rememberSnapshotVersion(config, version) {
  if (!version) return;
  snapshotVersions.set(snapshotVersionKey(config), String(version));
}

function forgetSnapshotVersion(config) {
  const versionKey = snapshotVersionKey(config);
  snapshotVersions.delete(versionKey);
  for (const observerVersionKey of snapshotObserverVersions.keys()) {
    if (observerVersionKey.endsWith(`\u0000${versionKey}`)) {
      snapshotObserverVersions.delete(observerVersionKey);
    }
  }
}

function cloudResponseError(response, message) {
  if (response?.status === 401) return new CloudStateAuthError();
  if (response?.status === 409) return new CloudStateConflictError();
  const error = new Error(message);
  error.status = Number(response?.status ?? 0) || 0;
  return error;
}

async function hashSpaceKey(spaceKey) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure cloud key hashing is unavailable");
  }

  const bytes = new TextEncoder().encode(spaceKey);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
