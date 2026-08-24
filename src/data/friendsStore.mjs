import { fetchWithTimeout } from "./fetchTimeout.mjs";
import { normalizeAvatarImage } from "../domain/avatarPresets.mjs";

const FRIEND_CODE_PATTERN = /^[a-f0-9]{20}$/;
const SHARED_SPACE_ID_PATTERN = /^[a-zA-Z0-9_-]{3,80}$/;
const ACCOUNT_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_CATEGORIES = new Set([
  "harassment",
  "impersonation",
  "offensive_content",
  "spam",
  "other"
]);
const PROFILE_SELECT =
  "user_id,username,username_customized,display_name,avatar_preset,avatar_image,updated_at";
const LEGACY_PROFILE_SELECT =
  "user_id,username,username_customized,display_name,avatar_preset,updated_at";

export function friendNetworkAvailable(config) {
  return Boolean(
    config?.storage?.mode === "supabase" &&
      config.storage.url &&
      config.storage.anonKey &&
      config.storage.account?.userId &&
      config.storage.account?.accessToken
  );
}

export async function syncFriendProfile(
  config,
  profile,
  fetchImpl = fetch
) {
  if (!friendNetworkAvailable(config) || !profile?.displayName) return null;

  const body = {
    display_name: String(profile.displayName).trim(),
    avatar_preset: String(profile.avatarPreset ?? "").trim() || null,
    avatar_image: normalizeAvatarImage(profile.avatarImage) || null,
    updated_at: new Date().toISOString()
  };
  try {
    return await patchFriendProfile(config, body, PROFILE_SELECT, fetchImpl);
  } catch (error) {
    if (!missingAvatarImageColumn(error)) throw error;
    const { avatar_image: _avatarImage, ...legacyBody } = body;
    return patchFriendProfile(config, legacyBody, LEGACY_PROFILE_SELECT, fetchImpl);
  }
}

export async function loadFriendNetwork(config, fetchImpl = fetch) {
  if (!friendNetworkAvailable(config)) {
    return emptyFriendNetwork("signed-out");
  }

  const userId = config.storage.account.userId;
  const [friendships, inviteCodes, blockedUsers] = await Promise.all([
    readRows(
      config,
      "friendships",
      {
        or: `(requester_id.eq.${userId},addressee_id.eq.${userId})`,
        select:
          "id,requester_id,addressee_id,status,requested_at,responded_at,updated_at",
        order: "updated_at.desc"
      },
      fetchImpl
    ),
    readRows(
      config,
      "friend_invite_codes",
      {
        user_id: `eq.${userId}`,
        select: "code"
      },
      fetchImpl
    ),
    readRows(
      config,
      "user_blocks",
      {
        blocker_user_id: `eq.${userId}`,
        select:
          "blocked_user_id,blocked_display_name,blocked_username,created_at",
        order: "created_at.desc"
      },
      fetchImpl
    )
  ]);

  const visibleUserIds = [
    ...new Set([
      userId,
      ...friendships.flatMap((friendship) => [
        friendship.requester_id,
        friendship.addressee_id
      ])
    ])
  ].filter(Boolean);
  const profiles = visibleUserIds.length
    ? await readFriendProfiles(config, visibleUserIds, fetchImpl)
    : [];

  return {
    status: "ready",
    userId,
    friendCode: normalizeFriendCode(inviteCodes[0]?.code),
    friendships,
    blockedUsers,
    profiles
  };
}

async function patchFriendProfile(config, body, select, fetchImpl) {
  const response = await fetchWithTimeout(
    fetchImpl,
    restUrl(config, "user_profiles", {
      user_id: `eq.${config.storage.account.userId}`,
      select
    }),
    {
      method: "PATCH",
      headers: {
        ...friendHeaders(config),
        prefer: "return=representation"
      },
      body: JSON.stringify(body)
    }
  );
  const rows = await responseJson(response);
  if (!response.ok) throw friendStoreError(rows, "Profile sync failed");
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

async function readFriendProfiles(config, userIds, fetchImpl) {
  const query = { user_id: `in.(${userIds.join(",")})` };
  try {
    return await readRows(
      config,
      "user_profiles",
      { ...query, select: PROFILE_SELECT },
      fetchImpl
    );
  } catch (error) {
    if (!missingAvatarImageColumn(error)) throw error;
    return readRows(
      config,
      "user_profiles",
      { ...query, select: LEGACY_PROFILE_SELECT },
      fetchImpl
    );
  }
}

function missingAvatarImageColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("avatar_image") && message.includes("column");
}

export async function requestFriendship(
  config,
  friendCode,
  fetchImpl = fetch
) {
  const code = normalizeFriendCode(friendCode);
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (!code) {
    throw new Error("Friend code is invalid");
  }
  return callFriendRpc(
    config,
    "request_friendship",
    { p_friend_code: code },
    fetchImpl
  );
}

export async function requestFriendshipByUsername(
  config,
  username,
  fetchImpl = fetch
) {
  const normalizedUsername = String(username ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (!normalizedUsername) {
    throw new Error("Username is invalid");
  }
  return callFriendRpc(
    config,
    "request_friendship_by_username",
    { p_username: normalizedUsername },
    fetchImpl
  );
}

export async function requestFriendshipFromEvent(
  config,
  sharedSpaceId,
  targetUserId,
  fetchImpl = fetch
) {
  const normalizedSpaceId = String(sharedSpaceId ?? "").trim();
  const normalizedTargetUserId = String(targetUserId ?? "").trim().toLowerCase();
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (
    !SHARED_SPACE_ID_PATTERN.test(normalizedSpaceId) ||
    normalizedSpaceId === "default"
  ) {
    throw new Error("Shared event is invalid");
  }
  if (!ACCOUNT_USER_ID_PATTERN.test(normalizedTargetUserId)) {
    throw new Error("Friend account is invalid");
  }
  return callFriendRpc(
    config,
    "request_friendship_from_event",
    {
      p_shared_space_id: normalizedSpaceId,
      p_target_user_id: normalizedTargetUserId
    },
    fetchImpl
  );
}

export async function setFriendUsername(
  config,
  username,
  fetchImpl = fetch
) {
  const normalizedUsername = String(username ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (!normalizedUsername) {
    throw new Error("Username is invalid");
  }
  return callFriendRpc(
    config,
    "set_friend_username",
    { p_username: normalizedUsername },
    fetchImpl
  );
}

export async function manageFriendship(
  config,
  friendshipId,
  action,
  fetchImpl = fetch
) {
  const normalizedAction = String(action ?? "").trim().toLowerCase();
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (
    !friendshipId ||
    !["accept", "decline", "cancel", "remove"].includes(normalizedAction)
  ) {
    throw new Error("Friendship action is invalid");
  }
  return callFriendRpc(
    config,
    "manage_friendship",
    {
      p_friendship_id: friendshipId,
      p_action: normalizedAction
    },
    fetchImpl
  );
}

export async function blockConnectedUser(
  config,
  targetUserId,
  fetchImpl = fetch
) {
  const normalizedTargetUserId = normalizeAccountUserId(targetUserId);
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (!normalizedTargetUserId) {
    throw new Error("Blocked account is invalid");
  }
  return callFriendRpc(
    config,
    "block_user",
    { p_target_user_id: normalizedTargetUserId },
    fetchImpl
  );
}

export async function unblockConnectedUser(
  config,
  targetUserId,
  fetchImpl = fetch
) {
  const normalizedTargetUserId = normalizeAccountUserId(targetUserId);
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (!normalizedTargetUserId) {
    throw new Error("Blocked account is invalid");
  }
  return callFriendRpc(
    config,
    "unblock_user",
    { p_target_user_id: normalizedTargetUserId },
    fetchImpl
  );
}

export async function submitUserReport(
  config,
  {
    sharedSpaceId,
    targetUserId,
    category,
    details = ""
  },
  fetchImpl = fetch
) {
  const normalizedSpaceId = String(sharedSpaceId ?? "").trim();
  const normalizedTargetUserId = normalizeAccountUserId(targetUserId);
  const normalizedCategory = String(category ?? "").trim().toLowerCase();
  const normalizedDetails = String(details ?? "").trim();
  if (!friendNetworkAvailable(config)) {
    throw new Error("Sign in is required");
  }
  if (
    !SHARED_SPACE_ID_PATTERN.test(normalizedSpaceId) ||
    normalizedSpaceId === "default"
  ) {
    throw new Error("Shared event is invalid");
  }
  if (!normalizedTargetUserId) {
    throw new Error("Reported account is invalid");
  }
  if (!REPORT_CATEGORIES.has(normalizedCategory)) {
    throw new Error("Report category is invalid");
  }
  if (normalizedDetails.length > 1000) {
    throw new Error("Report details are too long");
  }
  return callFriendRpc(
    config,
    "submit_user_report",
    {
      p_shared_space_id: normalizedSpaceId,
      p_target_user_id: normalizedTargetUserId,
      p_category: normalizedCategory,
      p_details: normalizedDetails
    },
    fetchImpl
  );
}

export function normalizeFriendCode(value) {
  const code = String(value ?? "").trim().toLowerCase();
  return FRIEND_CODE_PATTERN.test(code) ? code : "";
}

export function friendInviteCodeFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    return (
      normalizeFriendCode(url.searchParams.get("friend")) ||
      normalizeFriendCode(
        String(url.pathname).match(/^\/r\/([a-f0-9]{20})\/?$/i)?.[1]
      )
    );
  } catch {
    return "";
  }
}

export function buildFriendInviteUrl(publicUrl, friendCode) {
  const code = normalizeFriendCode(friendCode);
  if (!code) return "";
  const base = String(publicUrl ?? "").trim() || globalThis.location?.origin || "";
  if (!base) return "";
  const url = new URL(base);
  url.searchParams.set("friend", code);
  return url.toString();
}

export function emptyFriendNetwork(status = "loading") {
  return {
    status,
    userId: "",
    friendCode: "",
    friendships: [],
    blockedUsers: [],
    profiles: []
  };
}

function normalizeAccountUserId(value) {
  const userId = String(value ?? "").trim().toLowerCase();
  return ACCOUNT_USER_ID_PATTERN.test(userId) ? userId : "";
}

async function readRows(config, table, query, fetchImpl) {
  const response = await fetchWithTimeout(
    fetchImpl,
    restUrl(config, table, query),
    {
      headers: friendHeaders(config)
    }
  );
  const rows = await responseJson(response);
  if (!response.ok) throw friendStoreError(rows, "Friend data unavailable");
  return Array.isArray(rows) ? rows : [];
}

async function callFriendRpc(config, functionName, body, fetchImpl) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${String(config.storage.url).replace(/\/+$/, "")}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: friendHeaders(config),
      body: JSON.stringify(body)
    }
  );
  const payload = await responseJson(response);
  if (!response.ok) throw friendStoreError(payload, "Friend request failed");
  return payload;
}

function restUrl(config, table, query = {}) {
  const url = new URL(
    `${String(config.storage.url).replace(/\/+$/, "")}/rest/v1/${table}`
  );
  for (const [key, value] of Object.entries(query)) {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function friendHeaders(config) {
  return {
    apikey: config.storage.anonKey,
    authorization: `Bearer ${config.storage.account.accessToken}`,
    "content-type": "application/json"
  };
}

async function responseJson(response) {
  return response.json().catch(() => ({}));
}

function friendStoreError(payload, fallback) {
  const error = new Error(
    payload?.message ??
      payload?.details ??
      payload?.error_description ??
      payload?.error ??
      fallback
  );
  error.code = payload?.code ?? "";
  return error;
}
