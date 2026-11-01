import {fetchWithTimeout} from "./fetchTimeout.mjs";
import {normalizeBitProfile, normalizeBitReceivingUrl} from "../domain/bitProfile.mjs";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function bitProfileAvailable(config) {
  return config?.features?.bitQrProfile === true && config?.storage?.mode === "supabase" &&
    USER_ID.test(config.storage.account?.userId ?? "") &&
    Boolean(config.storage.url && config.storage.anonKey && config.storage.account?.accessToken);
}

function scope(config) {
  if (!bitProfileAvailable(config)) throw Object.assign(new Error("Bit profile is unavailable"), {code: "BIT_UNAVAILABLE"});
  // Capture credentials now: a subsequent sign-in cannot change this request's owner.
  return {url: String(config.storage.url).replace(/\/+$/, ""), key: config.storage.anonKey,
    token: config.storage.account.accessToken, userId: config.storage.account.userId};
}
async function rpc(owner, name, body, fetchImpl) {
  const {response, value} = await fetchWithTimeout(fetchImpl, `${owner.url}/rest/v1/rpc/${name}`, {
    method: "POST", cache: "no-store", headers: {apikey: owner.key,
      authorization: `Bearer ${owner.token}`, "content-type": "application/json"},
    body: JSON.stringify(body)
  }, 12_000, async response => ({response, value: await response.json().catch(() => null)}));
  if (!response.ok) {
    const code = value?.code === "40001" ? "BIT_CONFLICT" :
      response.status === 401 ? "BIT_AUTH" : response.status === 403 ? "BIT_FORBIDDEN" : "BIT_CLOUD";
    throw Object.assign(new Error("Bit profile request failed"), {code, status: response.status});
  }
  return value;
}
export async function loadOwnBitProfile(config, fetchImpl = fetch) {
  const owner = scope(config);
  return normalizeBitProfile(await rpc(owner, "get_my_bit_shortcut", {}, fetchImpl), owner.userId);
}
export async function saveOwnBitProfile(config, {url, expectedRevision}, fetchImpl = fetch) {
  const owner = scope(config);
  if (url !== null) normalizeBitReceivingUrl(url);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw Object.assign(new Error("Invalid profile revision"), {code: "BIT_REVISION"});
  }
  const saved = normalizeBitProfile(await rpc(owner, "set_my_bit_shortcut", {
    p_bit_url: url, p_expected_revision: expectedRevision
  }, fetchImpl), owner.userId);
  if (saved.revision !== expectedRevision + 1 || saved.url !== url) {
    throw Object.assign(new Error("Bit profile was not acknowledged"), {code: "BIT_ACK"});
  }
  return saved;
}

// Prepared recipient lookup; payment controls are deliberately unchanged in this branch.
export async function loadTransferBitProfile(config, {snapshotId, transferId}, fetchImpl = fetch) {
  const owner = scope(config);
  if (!snapshotId || !transferId || snapshotId.length > 160 || transferId.length > 160) throw new Error("Invalid transfer context");
  const value = await rpc(owner, "get_transfer_bit_shortcut", {p_snapshot_id: snapshotId, p_transfer_id: transferId}, fetchImpl);
  if (value === null) return null;
  if (value.transfer_id !== transferId || !USER_ID.test(value.recipient_user_id ?? "") ||
      value.recipient_participant_id !== `account-${value.recipient_user_id}` ||
      !Number.isSafeInteger(value.amount_minor) || value.amount_minor <= 0 ||
      !/^[A-Z]{3}$/.test(value.currency ?? "")) throw Object.assign(new Error("Invalid receiving context"), {code: "BIT_ACK"});
  const profile = normalizeBitProfile(value.shortcut, value.recipient_user_id);
  return Object.freeze({transferId, recipientUserId: profile.userId,
    recipientParticipantId: value.recipient_participant_id, amountMinor: value.amount_minor,
    currency: value.currency, profile});
}
