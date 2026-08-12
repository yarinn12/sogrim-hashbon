import { normalizeReferralCode } from "./referralCodes.mjs";

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SPACE_ID_PATTERN = /^(?!default$)[A-Za-z0-9_-]{3,80}$/;
const SPACE_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function buildCompactInviteUrl(currentUrl, eventId, spaceId, spaceKey) {
  const parts = normalizeCompactInviteParts({ eventId, spaceId, spaceKey });
  if (!parts) throw new TypeError("Invalid compact invite credentials.");

  const url = new URL(currentUrl);
  const referralCode = normalizeReferralCode(url.searchParams.get("ref"));
  url.pathname = `/i/${parts.eventId}/${parts.spaceId}/${parts.spaceKey}`;
  url.search = "";
  url.hash = "";
  if (referralCode) url.searchParams.set("ref", referralCode);
  return url.toString();
}

export function parseCompactInviteUrl(urlValue) {
  try {
    const url = urlValue instanceof URL ? urlValue : new URL(urlValue);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 4 || pathParts[0] !== "i") return null;

    return normalizeCompactInviteParts({
      eventId: decodeURIComponent(pathParts[1]),
      spaceId: decodeURIComponent(pathParts[2]),
      spaceKey: decodeURIComponent(pathParts[3])
    });
  } catch {
    return null;
  }
}

function normalizeCompactInviteParts({ eventId, spaceId, spaceKey }) {
  const normalized = {
    eventId: String(eventId ?? "").trim(),
    spaceId: String(spaceId ?? "").trim(),
    spaceKey: String(spaceKey ?? "").trim()
  };

  return (
    EVENT_ID_PATTERN.test(normalized.eventId) &&
    SPACE_ID_PATTERN.test(normalized.spaceId) &&
    SPACE_KEY_PATTERN.test(normalized.spaceKey)
  ) ? normalized : null;
}
