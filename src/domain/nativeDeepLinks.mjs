import { parseCompactInviteUrl } from "./compactInvite.mjs";
import { parseInviteEventId, parseInviteToken } from "./inviteLinks.mjs";
import {
  allowedPublicHosts,
  PUBLIC_ORIGIN,
  runtimePublicOrigin
} from "./publicOrigin.mjs";
import { normalizeReferralCode } from "./referralCodes.mjs";

export const NATIVE_PUBLIC_HOST = new URL(PUBLIC_ORIGIN).hostname;
export const NATIVE_AUTH_PATH = "/auth/callback";

export function nativePublicOrigin(config) {
  return runtimePublicOrigin(config);
}

export function nativeDestination(
  value,
  { publicHosts = allowedPublicHosts() } = {}
) {
  try {
    const url = new URL(value);
    const trustedHosts = publicHosts instanceof Set
      ? publicHosts
      : new Set(Array.isArray(publicHosts) ? publicHosts : [publicHosts]);

    if (url.protocol !== "https:" || !trustedHosts.has(url.hostname)) return "";

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
