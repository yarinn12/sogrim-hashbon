const snapshotVersions = new Map();

export class CloudStateConflictError extends Error {
  constructor() {
    super("Cloud state changed on another device");
    this.name = "CloudStateConflictError";
    this.code = "CLOUD_STATE_CONFLICT";
  }
}

export async function loadCloudState(config, fallbackState, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return fallbackState;

  const state = await readCloudState(config, fetchImpl);
  if (state) return state;

  await saveCloudState(config, fallbackState, fetchImpl);
  return fallbackState;
}

export async function readCloudState(config, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return null;

  const response = await fetchImpl(snapshotReadUrl(config), {
    headers: cloudHeaders(config)
  });

  if (!response.ok) throw new Error("Cloud state unavailable");

  const rows = await response.json();
  const state = rows[0]?.state;
  if (state) {
    rememberSnapshotVersion(config, rows[0]?.updated_at);
    return state;
  }

  return null;
}

export async function saveCloudState(config, state, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return;

  if (!config.storage.spaceKey) {
    throw new Error("Cloud space key is missing");
  }

  const currentVersion = snapshotVersions.get(snapshotVersionKey(config));
  const nextVersion = new Date().toISOString();
  const isUpdate = Boolean(currentVersion);
  const response = await fetchImpl(
    isUpdate ? snapshotUpdateUrl(config, currentVersion) : snapshotWriteUrl(config),
    {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        ...cloudHeaders(config),
        prefer: isUpdate
          ? "return=representation"
          : "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        id: config.storage.spaceId,
        state,
        updated_at: nextVersion,
        ...(isAccountOwnedSpace(config)
          ? { owner_user_id: config.storage.account.userId }
          : {}),
        ...(isUpdate ? {} : { access_key_hash: await hashSpaceKey(config.storage.spaceKey) })
      })
    }
  );

  if (!response.ok) throw new Error("Cloud state save failed");

  const rows = await response.json();
  if (isUpdate && (!Array.isArray(rows) || rows.length === 0)) {
    throw new CloudStateConflictError();
  }

  rememberSnapshotVersion(config, rows?.[0]?.updated_at ?? nextVersion);
}

function snapshotReadUrl(config) {
  return `${snapshotWriteUrl(config)}?id=eq.${encodeURIComponent(config.storage.spaceId)}&select=state,updated_at`;
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

function snapshotVersionKey(config) {
  return `${config.storage.url}/${config.storage.table}/${config.storage.spaceId}`;
}

function rememberSnapshotVersion(config, version) {
  if (!version) return;
  snapshotVersions.set(snapshotVersionKey(config), String(version));
}

async function hashSpaceKey(spaceKey) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure cloud key hashing is unavailable");
  }

  const bytes = new TextEncoder().encode(spaceKey);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
