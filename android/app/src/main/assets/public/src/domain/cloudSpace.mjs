import { parseCompactInviteUrl } from "./compactInvite.mjs";

export const CLIENT_SPACE_STORAGE_KEY = "settle-friends-cloud-space";
export const CLIENT_SPACE_KEY_STORAGE_PREFIX = "settle-friends-cloud-key:";
export const INVITE_SPACE_PARAM = "space";
export const INVITE_SPACE_KEY_PARAM = "key";

export function parseInviteSpaceId(urlValue) {
  try {
    const url = new URL(urlValue);
    return normalizeSpaceId(url.searchParams.get(INVITE_SPACE_PARAM)) ??
      parseCompactInviteUrl(url)?.spaceId ?? null;
  } catch {
    return null;
  }
}

export function parseInviteSpaceKey(urlValue) {
  try {
    const url = new URL(urlValue);
    return normalizeSpaceKey(url.searchParams.get(INVITE_SPACE_KEY_PARAM)) ??
      parseCompactInviteUrl(url)?.spaceKey ?? null;
  } catch {
    return null;
  }
}

export function peekClientSpaceId(currentUrl, storage) {
  return normalizeSpaceId(safeStorageGet(storage, CLIENT_SPACE_STORAGE_KEY));
}

export function resolveClientSpaceId({
  currentUrl,
  storage,
  createId = createClientSpaceId
}) {
  const existingSpaceId = normalizeSpaceId(
    safeStorageGet(storage, CLIENT_SPACE_STORAGE_KEY)
  );

  if (existingSpaceId) {
    safeStorageSet(storage, CLIENT_SPACE_STORAGE_KEY, existingSpaceId);
    return existingSpaceId;
  }

  const spaceId = normalizeSpaceId(createId());
  if (!spaceId) throw new Error("Unable to create client cloud space.");

  safeStorageSet(storage, CLIENT_SPACE_STORAGE_KEY, spaceId);
  return spaceId;
}

export function peekClientSpaceKey(currentUrl, spaceId, storage) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  if (!normalizedSpaceId) return null;

  return normalizeSpaceKey(
    safeStorageGet(storage, spaceKeyStorageKey(normalizedSpaceId))
  );
}

export function resolveClientSpaceKey({
  currentUrl,
  spaceId,
  storage,
  createKey = createClientSpaceKey
}) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  if (!normalizedSpaceId) throw new Error("Unable to resolve client cloud space key.");

  const existingKey = peekClientSpaceKey(currentUrl, normalizedSpaceId, storage);
  if (existingKey) {
    safeStorageSet(storage, spaceKeyStorageKey(normalizedSpaceId), existingKey);
    return existingKey;
  }

  const spaceKey = normalizeSpaceKey(createKey());
  if (!spaceKey) throw new Error("Unable to create client cloud space key.");

  safeStorageSet(storage, spaceKeyStorageKey(normalizedSpaceId), spaceKey);
  return spaceKey;
}

export function applyClientSpaceToConfig(config, spaceId, spaceKey = "") {
  if (config?.storage?.mode !== "supabase") return config;

  const normalizedSpaceId = normalizeSpaceId(spaceId);
  if (!normalizedSpaceId) return config;

  return {
    ...config,
    storage: {
      ...config.storage,
      spaceId: normalizedSpaceId,
      ...(normalizeSpaceKey(spaceKey) || config.storage.spaceKey
        ? { spaceKey: normalizeSpaceKey(spaceKey) ?? config.storage.spaceKey }
        : {})
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

export function normalizeSpaceKey(value) {
  const normalized = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{32,160}$/.test(normalized) ? normalized : null;
}

export function createClientSpaceKey() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
  }

  return `${createClientSpaceId()}-${createClientSpaceId()}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

function spaceKeyStorageKey(spaceId) {
  return `${CLIENT_SPACE_KEY_STORAGE_PREFIX}${spaceId}`;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  if (typeof btoa === "function") {
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
