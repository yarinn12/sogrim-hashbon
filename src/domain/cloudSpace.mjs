export const CLIENT_SPACE_STORAGE_KEY = "settle-friends-cloud-space";
export const INVITE_SPACE_PARAM = "space";

export function parseInviteSpaceId(urlValue) {
  try {
    const url = new URL(urlValue);
    return normalizeSpaceId(url.searchParams.get(INVITE_SPACE_PARAM));
  } catch {
    return null;
  }
}

export function peekClientSpaceId(currentUrl, storage) {
  return (
    parseInviteSpaceId(currentUrl) ??
    normalizeSpaceId(safeStorageGet(storage, CLIENT_SPACE_STORAGE_KEY))
  );
}

export function resolveClientSpaceId({
  currentUrl,
  storage,
  createId = createClientSpaceId
}) {
  const existingSpaceId =
    parseInviteSpaceId(currentUrl) ??
    normalizeSpaceId(safeStorageGet(storage, CLIENT_SPACE_STORAGE_KEY));

  if (existingSpaceId) {
    safeStorageSet(storage, CLIENT_SPACE_STORAGE_KEY, existingSpaceId);
    return existingSpaceId;
  }

  const spaceId = normalizeSpaceId(createId());
  if (!spaceId) throw new Error("Unable to create client cloud space.");

  safeStorageSet(storage, CLIENT_SPACE_STORAGE_KEY, spaceId);
  return spaceId;
}

export function applyClientSpaceToConfig(config, spaceId) {
  if (config?.storage?.mode !== "supabase") return config;

  const normalizedSpaceId = normalizeSpaceId(spaceId);
  if (!normalizedSpaceId) return config;

  return {
    ...config,
    storage: {
      ...config.storage,
      spaceId: normalizedSpaceId
    }
  };
}

export function normalizeSpaceId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(normalized)) return null;
  if (normalized === "default") return null;
  return normalized;
}

export function createClientSpaceId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `space-${timePart}-${randomPart}`;
}

function safeStorageGet(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {}
}
