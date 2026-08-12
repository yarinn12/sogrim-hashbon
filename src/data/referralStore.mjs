import {
  emptyReferralProgramStatus,
  normalizeReferralProgramStatus
} from "../domain/entitlements.mjs";
import { normalizeReferralCode } from "../domain/referralCodes.mjs";

export { normalizeReferralCode };

export function referralProgramAvailable(config) {
  return Boolean(
    config?.storage?.mode === "supabase" &&
      config.storage.url &&
      config.storage.anonKey &&
      config.storage.account?.userId &&
      config.storage.account?.accessToken
  );
}

export function referralCodeFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    return (
      normalizeReferralCode(url.searchParams.get("ref")) ||
      referralCodeFromPath(url.pathname)
    );
  } catch {
    return "";
  }
}

export function buildReferralInviteUrl(publicUrl, referralCode) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return "";
  const base = String(publicUrl ?? "").trim() || globalThis.location?.origin || "";
  if (!base) return "";

  const url = new URL(base);
  url.pathname = `/r/${code}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function withoutReferralAttribution(urlValue) {
  try {
    const url = new URL(urlValue);
    const pathCode = referralCodeFromPath(url.pathname);
    if (pathCode) {
      url.pathname = "/";
      url.searchParams.set("friend", pathCode);
    }
    url.searchParams.delete("ref");
    return url.toString();
  } catch {
    return String(urlValue ?? "");
  }
}

function referralCodeFromPath(pathname) {
  return normalizeReferralCode(
    String(pathname ?? "").match(/^\/r\/([a-f0-9]{20})\/?$/i)?.[1]
  );
}

export async function claimReferral(config, referralCode, fetchImpl = fetch) {
  const code = normalizeReferralCode(referralCode);
  if (!referralProgramAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (!code) throw new Error("Referral code is invalid");

  return callReferralRpc(
    config,
    "claim_referral",
    { p_referral_code: code },
    fetchImpl
  );
}

export async function qualifyReferral(config, eventId, fetchImpl = fetch) {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!referralProgramAvailable(config)) {
    return { status: "unavailable" };
  }
  if (!normalizedEventId) throw new Error("Event id is required");

  return callReferralRpc(
    config,
    "qualify_referral",
    { p_event_id: normalizedEventId },
    fetchImpl
  );
}

export async function loadReferralProgramStatus(config, fetchImpl = fetch) {
  if (!referralProgramAvailable(config)) {
    return emptyReferralProgramStatus("signed-out");
  }

  const payload = await callReferralRpc(
    config,
    "get_referral_program_status",
    {},
    fetchImpl
  );
  return normalizeReferralProgramStatus(payload);
}

async function callReferralRpc(config, functionName, body, fetchImpl) {
  const response = await fetchImpl(
    `${String(config.storage.url).replace(/\/+$/, "")}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: config.storage.anonKey,
        authorization: `Bearer ${config.storage.account.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw referralStoreError(payload);
  return payload;
}

function referralStoreError(payload) {
  const error = new Error(
    payload?.message ??
      payload?.details ??
      payload?.error_description ??
      payload?.error ??
      "Referral service is unavailable"
  );
  error.code = payload?.code ?? "";
  return error;
}
