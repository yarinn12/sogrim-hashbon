import { parseInviteSpaceId, parseInviteSpaceKey } from "../domain/cloudSpace.mjs";
import {
  parseInviteEventId,
  parseInviteSnapshot,
  parseInviteToken
} from "../domain/inviteLinks.mjs";
import { canonicalizePublicUrl } from "../domain/publicOrigin.mjs";

export const PENDING_INVITE_URL_STORAGE_KEY = "sogrim-pending-invite-url";
export const PENDING_INVITE_HANDOFF_STORAGE_KEY =
  "sogrim-pending-invite-handoff-v1";
export const PENDING_INVITE_HANDOFF_TTL_MS = 48 * 60 * 60 * 1000;

export function rememberPendingInviteUrl(
  urlValue = globalThis.location?.href,
  storage = globalThis.sessionStorage,
  durableStorage = globalThis.localStorage,
  now = Date.now()
) {
  const inviteUrl = validInviteUrl(urlValue);
  if (!inviteUrl) return null;
  try {
    storage?.setItem(PENDING_INVITE_URL_STORAGE_KEY, inviteUrl);
  } catch {}
  try {
    durableStorage?.setItem(
      PENDING_INVITE_HANDOFF_STORAGE_KEY,
      JSON.stringify({ inviteUrl, savedAt: Number(now) })
    );
  } catch {}
  return inviteUrl;
}

export function pendingInviteUrl(
  currentUrl = globalThis.location?.href,
  storage = globalThis.sessionStorage,
  durableStorage = globalThis.localStorage,
  now = Date.now()
) {
  const currentInvite = validInviteUrl(currentUrl);
  if (currentInvite) {
    rememberPendingInviteUrl(
      currentInvite,
      storage,
      durableStorage,
      now
    );
    return currentInvite;
  }

  try {
    const storedInvite = validInviteUrl(storage?.getItem(PENDING_INVITE_URL_STORAGE_KEY));
    if (storedInvite) {
      rememberPendingInviteUrl(
        storedInvite,
        storage,
        durableStorage,
        now
      );
      return storedInvite;
    }
    storage?.removeItem(PENDING_INVITE_URL_STORAGE_KEY);
  } catch {}

  try {
    const handoff = JSON.parse(
      durableStorage?.getItem(PENDING_INVITE_HANDOFF_STORAGE_KEY) ?? "null"
    );
    const savedAt = Number(handoff?.savedAt);
    const durableInvite = validInviteUrl(handoff?.inviteUrl);
    const handoffIsFresh =
      Number.isFinite(savedAt) &&
      Number(now) >= savedAt &&
      Number(now) - savedAt <= PENDING_INVITE_HANDOFF_TTL_MS;
    if (durableInvite && handoffIsFresh) {
      try {
        storage?.setItem(PENDING_INVITE_URL_STORAGE_KEY, durableInvite);
      } catch {}
      return durableInvite;
    }
    durableStorage?.removeItem(PENDING_INVITE_HANDOFF_STORAGE_KEY);
  } catch {
    try {
      durableStorage?.removeItem(PENDING_INVITE_HANDOFF_STORAGE_KEY);
    } catch {}
  }

  return String(currentUrl ?? "");
}

export function clearPendingInviteUrl(
  storage = globalThis.sessionStorage,
  durableStorage = globalThis.localStorage
) {
  try {
    storage?.removeItem(PENDING_INVITE_URL_STORAGE_KEY);
  } catch {}
  try {
    durableStorage?.removeItem(PENDING_INVITE_HANDOFF_STORAGE_KEY);
  } catch {}
}

function validInviteUrl(urlValue) {
  const value = String(urlValue ?? "").trim();
  if (!value) return null;

  const eventId = parseInviteEventId(value);
  if (!eventId) return null;

  const snapshot = parseInviteSnapshot(value);
  const hasSnapshot = snapshot?.event?.id === eventId;
  const hasCloudAccess = Boolean(parseInviteSpaceId(value) && parseInviteSpaceKey(value));
  const hasInviteToken = Boolean(parseInviteToken(value));
  return hasSnapshot || hasCloudAccess || hasInviteToken
    ? canonicalizePublicUrl(value, value)
    : null;
}
