import { parseInviteSpaceId, parseInviteSpaceKey } from "../domain/cloudSpace.mjs";
import {
  parseInviteEventId,
  parseInviteSnapshot,
  parseInviteToken
} from "../domain/inviteLinks.mjs";

export const PENDING_INVITE_URL_STORAGE_KEY = "sogrim-pending-invite-url";

export function rememberPendingInviteUrl(
  urlValue = globalThis.location?.href,
  storage = globalThis.sessionStorage
) {
  const inviteUrl = validInviteUrl(urlValue);
  if (!inviteUrl) return null;
  try {
    storage?.setItem(PENDING_INVITE_URL_STORAGE_KEY, inviteUrl);
  } catch {}
  return inviteUrl;
}

export function pendingInviteUrl(
  currentUrl = globalThis.location?.href,
  storage = globalThis.sessionStorage
) {
  const currentInvite = validInviteUrl(currentUrl);
  if (currentInvite) return currentInvite;

  try {
    const storedInvite = validInviteUrl(storage?.getItem(PENDING_INVITE_URL_STORAGE_KEY));
    if (storedInvite) return storedInvite;
    storage?.removeItem(PENDING_INVITE_URL_STORAGE_KEY);
  } catch {}

  return String(currentUrl ?? "");
}

export function clearPendingInviteUrl(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(PENDING_INVITE_URL_STORAGE_KEY);
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
  return hasSnapshot || hasCloudAccess || hasInviteToken ? value : null;
}
