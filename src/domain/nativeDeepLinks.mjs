import { parseCompactInviteUrl } from "./compactInvite.mjs";
import { parseInviteEventId, parseInviteToken } from "./inviteLinks.mjs";
import { normalizeReferralCode } from "./referralCodes.mjs";

export const NATIVE_PUBLIC_HOST = "sogrim-hashbon.vercel.app";
export const NATIVE_AUTH_PATH = "/auth/callback";

export function nativeDestination(
  value,
  { publicHost = NATIVE_PUBLIC_HOST } = {}
) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.hostname !== publicHost) return "";

    const compactInvite = parseCompactInviteUrl(url);
    if (compactInvite) {
      const params = new URLSearchParams({
        event: compactInvite.eventId,
        space: compactInvite.spaceId,
        key: compactInvite.spaceKey
      });
      const referralCode = normalizeReferralCode(url.searchParams.get("ref"));
      if (referralCode) params.set("ref", referralCode);
      return `./?${params.toString()}${url.hash}`;
    }

    const tokenInviteEventId = parseInviteEventId(url.toString());
    const inviteToken = parseInviteToken(url.toString());
    if (url.pathname.startsWith("/i/") && tokenInviteEventId && inviteToken) {
      const params = new URLSearchParams({
        event: tokenInviteEventId,
        t: inviteToken
      });
      const referralCode = normalizeReferralCode(url.searchParams.get("ref"));
      if (referralCode) params.set("ref", referralCode);
      return `./?${params.toString()}${url.hash}`;
    }

    const referralMatch = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (referralMatch) {
      const referralCode = normalizeReferralCode(referralMatch[1]);
      return referralCode ? `./?ref=${encodeURIComponent(referralCode)}` : "";
    }

    if (url.pathname === NATIVE_AUTH_PATH) {
      return `./${url.search}${url.hash}`;
    }

    if (url.pathname !== "/") return "";
    return `./${url.search}${url.hash}`;
  } catch {
    return "";
  }
}
