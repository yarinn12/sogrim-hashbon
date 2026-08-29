import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { isSafeSharedIdentifier } from "../domain/sharedStateMerge.mjs";

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERED_MEMBER_SPACE_KEY = "member_access_recovery_v1_key_0001";

export async function manageOpenEventInvite({
  runtimeConfig,
  env = process.env,
  authorization = "",
  eventId = "",
  candidateToken = "",
  operation = "ensure",
  fetchImpl = fetch,
  tokenFactory = null
}) {
  const context = serverContext(runtimeConfig, env);
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedOperation = operation === "rotate" ? "rotate" : "ensure";
  const normalizedCandidate = normalizeInviteToken(candidateToken);
  const accountToken = bearerToken(authorization);
  let recoveredActiveInvite = false;

  if (!accountToken) {
    return failure(401, "Authentication is required", {
      code: "AUTH_REQUIRED"
    });
  }
  if (!isSafeSharedIdentifier(normalizedEventId)) {
    return failure(400, "Event invitation is invalid", {
      code: "INVALID_EVENT_INVITE"
    });
  }
  if (!context) {
    return failure(503, "Event invitations are unavailable", {
      code: "EVENT_INVITES_UNAVAILABLE"
    });
  }

  const actor = await loadAuthenticatedUser({
    ...context,
    accessToken: accountToken,
    fetchImpl
  });
  if (!actor?.id) {
    return failure(401, "Account session is invalid", {
      code: "AUTH_REQUIRED"
    });
  }

  const actorState = await loadAccountState({
    ...context,
    userId: actor.id,
    eventId: normalizedEventId,
    fetchImpl
  });
  const event = eventFromState(actorState, normalizedEventId);
  const participantId = `account-${actor.id}`;
  if (!event) {
    return failure(403, "This account cannot create an open link", {
      code: "EVENT_INVITE_NOT_ALLOWED"
    });
  }

  const spaceId = String(event.sharedSpaceId ?? "").trim();
  let spaceKey = String(event.sharedSpaceKey ?? "").trim();
  if (
    !isSafeSharedIdentifier(spaceId) ||
    !isSafeSharedIdentifier(spaceKey)
  ) {
    return failure(409, "The shared event is not ready", {
      code: "EVENT_INVITE_NOT_READY",
      retryable: true
    });
  }
  let sharedEvent = await loadVerifiedSharedEvent({
    ...context,
    eventId: normalizedEventId,
    spaceId,
    spaceKey,
    fetchImpl
  });
  if (!sharedEvent && spaceKey === RECOVERED_MEMBER_SPACE_KEY) {
    const recovered = await loadMemberAccessibleSharedEvent({
      ...context,
      accessToken: accountToken,
      eventId: normalizedEventId,
      spaceId,
      fetchImpl
    });
    sharedEvent = recovered?.event ?? null;
    spaceKey = recovered?.spaceKey ?? spaceKey;
  }
  if (
    !sharedEvent ||
    !canCreateOpenInvite({ groups: [] }, sharedEvent, participantId)
  ) {
    return failure(403, "This account cannot create an open link", {
      code: "EVENT_INVITE_NOT_ALLOWED"
    });
  }
  const inviteAnchor = await loadInviteEventAnchor({
    ...context,
    eventId: normalizedEventId,
    spaceId,
    fetchImpl
  });
  if (
    inviteAnchor &&
    !sameInviteCredentials(inviteAnchor, { spaceId, spaceKey })
  ) {
    return failure(409, "The event invitation credentials do not match", {
      code: "EVENT_INVITE_INVALIDATED"
    });
  }

  const stableToken = createStableOpenInviteToken({
    secret: context.serviceRoleKey,
    eventId: normalizedEventId,
    spaceId,
    spaceKey
  });
  if (normalizedOperation === "ensure") {
    for (const token of [normalizedCandidate, stableToken].filter(Boolean)) {
      const active = await loadActiveInviteByToken({
        ...context,
        eventId: normalizedEventId,
        spaceId,
        token,
        kind: "open",
        fetchImpl
      });
      if (
        active &&
        active.space_id === spaceId &&
        active.space_key === spaceKey
      ) {
        return success({
          eventId: normalizedEventId,
          token,
          createdAt: String(active.created_at ?? ""),
          rotated: false
        });
      }
    }
  }

  if (normalizedOperation === "ensure") {
    const active = await loadActiveOpenInvite({
      ...context,
      eventId: normalizedEventId,
      spaceId,
      fetchImpl
    });
    if (active) {
      const recoverableToken = createRotatedOpenInviteToken({
        secret: context.serviceRoleKey,
        eventId: normalizedEventId,
        spaceId,
        spaceKey,
        createdAt: String(active.created_at ?? "")
      });
      if (
        recoverableToken &&
        sameInviteCredentials(active, { spaceId, spaceKey }) &&
        secureHashEquals(active.token_hash, hashInviteToken(recoverableToken))
      ) {
        return success({
          eventId: normalizedEventId,
          token: recoverableToken,
          createdAt: String(active.created_at ?? ""),
          rotated: false
        });
      }
      // Tokens are stored only as hashes, so a newly signed-in device cannot
      // recover historical random tokens. Replace only that legacy case; all
      // newly rotated tokens are deterministic and recoverable on every device.
      recoveredActiveInvite = true;
    }
  }

  const createdAt = new Date().toISOString();
  const token = normalizedOperation === "ensure"
    ? stableToken
    : typeof tokenFactory === "function"
      ? tokenFactory()
      : createRotatedOpenInviteToken({
          secret: context.serviceRoleKey,
          eventId: normalizedEventId,
          spaceId,
          spaceKey,
          createdAt
        });
  if (!normalizeInviteToken(token)) {
    return failure(500, "Unable to create an invitation token", {
      code: "EVENT_INVITE_TOKEN_FAILED"
    });
  }
  const rotated = await rotateOpenInviteRow({
    ...context,
    eventId: normalizedEventId,
    userId: actor.id,
    token,
    spaceId,
    spaceKey,
    createdAt,
    fetchImpl
  });
  if (!rotated) {
    return failure(503, "Unable to save the invitation link", {
      code: "EVENT_INVITE_STORAGE_FAILED",
      retryable: true
    });
  }

  return success({
    eventId: normalizedEventId,
    token,
    createdAt,
    rotated: normalizedOperation === "rotate" || recoveredActiveInvite
  });
}

function createStableOpenInviteToken({ secret, eventId, spaceId, spaceKey }) {
  return createHmac("sha256", secret)
    .update(`open-event-invite\0${spaceId}\0${eventId}\0${spaceKey}`)
    .digest("base64url");
}

function createRotatedOpenInviteToken({
  secret,
  eventId,
  spaceId,
  spaceKey,
  createdAt
}) {
  const normalizedCreatedAt = normalizeInviteCreatedAt(createdAt);
  if (!normalizedCreatedAt) return "";
  return createHmac("sha256", secret)
    .update(`rotated-open-event-invite\0${spaceId}\0${eventId}\0${spaceKey}\0${normalizedCreatedAt}`)
    .digest("base64url");
}

function normalizeInviteCreatedAt(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

export async function redeemEventInvite({
  runtimeConfig,
  env = process.env,
  authorization = "",
  eventId = "",
  token = "",
  fetchImpl = fetch
}) {
  const context = serverContext(runtimeConfig, env);
  const normalizedEventId = String(eventId ?? "").trim();
  const normalizedToken = normalizeInviteToken(token);
  if (!isSafeSharedIdentifier(normalizedEventId) || !normalizedToken) {
    return failure(400, "Event invitation is invalid", {
      code: "INVALID_EVENT_INVITE"
    });
  }
  if (!context) {
    return failure(503, "Event invitations are unavailable", {
      code: "EVENT_INVITES_UNAVAILABLE"
    });
  }

  const accountToken = bearerToken(authorization);
  if (!accountToken) {
    return failure(401, "Sign in to accept this invitation", {
      code: "EVENT_INVITE_AUTH_REQUIRED"
    });
  }
  const recipient = await loadAuthenticatedUser({
    ...context,
    accessToken: accountToken,
    fetchImpl
  });
  if (!recipient?.id) {
    return failure(401, "Sign in to accept this invitation", {
      code: "EVENT_INVITE_AUTH_REQUIRED"
    });
  }

  const invite = await loadActiveInviteByToken({
    ...context,
    eventId: normalizedEventId,
    token: normalizedToken,
    fetchImpl
  });
  if (!invite) {
    return failure(410, "This invitation link is no longer active", {
      code: "EVENT_INVITE_REVOKED"
    });
  }
  if (
    invite.expires_at &&
    Date.parse(invite.expires_at) <= Date.now()
  ) {
    return failure(410, "This invitation link has expired", {
      code: "EVENT_INVITE_EXPIRED"
    });
  }

  if (invite.kind === "private") {
    if (recipient.id !== invite.recipient_user_id) {
      return failure(403, "This private invitation belongs to another account", {
        code: "PRIVATE_INVITE_RECIPIENT_MISMATCH"
      });
    }
  }

  const spaceId = String(invite.space_id ?? "").trim();
  const spaceKey = String(invite.space_key ?? "").trim();
  if (
    !isSafeSharedIdentifier(spaceId) ||
    !isSafeSharedIdentifier(spaceKey)
  ) {
    return failure(410, "This invitation can no longer open the event", {
      code: "EVENT_INVITE_INVALIDATED"
    });
  }
  const sharedEvent = spaceKey === RECOVERED_MEMBER_SPACE_KEY
    ? await loadSharedEventById({
        ...context,
        eventId: normalizedEventId,
        spaceId,
        fetchImpl
      })
    : await loadVerifiedSharedEvent({
        ...context,
        eventId: normalizedEventId,
        spaceId,
        spaceKey,
        fetchImpl
      });
  if (!sharedEvent) {
    return failure(410, "This invitation can no longer open the event", {
      code: "EVENT_INVITE_INVALIDATED"
    });
  }
  if (
    invite.kind === "open" &&
    !canCreateOpenInvite(
      { groups: [] },
      sharedEvent,
      `account-${String(invite.created_by ?? "")}`
    )
  ) {
    await revokeInviteRow({
      ...context,
      inviteId: invite.id,
      fetchImpl
    }).catch(() => {});
    return failure(410, "This open invitation is no longer active", {
      code: "EVENT_INVITE_REVOKED"
    });
  }
  if (invite.kind === "private") {
    const recipientUserId = String(invite.recipient_user_id ?? "");
    const senderUserId = String(invite.created_by ?? "");
    const stillEligible = Boolean(
      isActiveEventParticipant(
        sharedEvent,
        `account-${recipientUserId}`
      ) &&
      isActiveEventParticipant(
        sharedEvent,
        `account-${senderUserId}`
      )
    );
    if (!stillEligible) {
      await revokeInviteRow({
        ...context,
        inviteId: invite.id,
        fetchImpl
      }).catch(() => {});
      return failure(410, "This private invitation is no longer active", {
        code: "EVENT_INVITE_REVOKED"
      });
    }
  }

  const membershipActivated = await activateInviteMembership({
    ...context,
    inviteId: invite.id,
    token: normalizedToken,
    userId: recipient.id,
    fetchImpl
  });
  if (!membershipActivated) {
    return failure(410, "This invitation can no longer open the event", {
      code: "EVENT_INVITE_INVALIDATED"
    });
  }
  const indexed = await indexSharedEventForMember({
    ...context,
    snapshotId: spaceId,
    userId: recipient.id,
    fetchImpl
  });
  if (!indexed) {
    return failure(503, "The event is still being added to this account", {
      code: "EVENT_MEMBERSHIP_INDEX_PENDING",
      retryable: true
    });
  }

  return success({
    eventId: normalizedEventId,
    kind: invite.kind,
    spaceId,
    spaceKey
  });
}

export async function createPrivateEventInvite({
  supabaseUrl,
  serviceRoleKey,
  event,
  senderUserId,
  recipientUserId,
  fetchImpl = fetch,
  tokenFactory = createInviteToken
}) {
  const eventId = String(event?.id ?? "").trim();
  const spaceId = String(event?.sharedSpaceId ?? "").trim();
  const spaceKey = String(event?.sharedSpaceKey ?? "").trim();
  if (
    !isSafeSharedIdentifier(eventId) ||
    !isSafeSharedIdentifier(spaceId) ||
    !isSafeSharedIdentifier(spaceKey) ||
    !UUID_PATTERN.test(String(senderUserId ?? "")) ||
    !UUID_PATTERN.test(String(recipientUserId ?? "")) ||
    senderUserId === recipientUserId
  ) {
    return null;
  }
  const sharedEvent = await loadVerifiedSharedEvent({
    supabaseUrl,
    serviceRoleKey,
    eventId,
    spaceId,
    spaceKey,
    fetchImpl
  });
  const inviteAnchor = await loadInviteEventAnchor({
    supabaseUrl,
    serviceRoleKey,
    eventId,
    spaceId,
    fetchImpl
  });
  if (
    !sharedEvent ||
    !isActiveEventParticipant(sharedEvent, `account-${senderUserId}`) ||
    !isActiveEventParticipant(sharedEvent, `account-${recipientUserId}`) ||
    (
      inviteAnchor &&
      !sameInviteCredentials(inviteAnchor, { spaceId, spaceKey })
    )
  ) {
    return null;
  }

  const token = tokenFactory();
  if (!normalizeInviteToken(token)) return null;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(createdAt) + PRIVATE_INVITE_LIFETIME_MS
  ).toISOString();
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/rotate_private_event_invite`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_event_id: eventId,
        p_created_by: senderUserId,
        p_recipient_user_id: recipientUserId,
        p_token_hash: hashInviteToken(token),
        p_space_id: spaceId,
        p_space_key: spaceKey,
        p_created_at: createdAt,
        p_expires_at: expiresAt
      })
    }
  );
  const inviteId = response.ok
    ? String(await response.json().catch(() => "")).trim()
    : "";
  return UUID_PATTERN.test(inviteId)
    ? { id: inviteId, token, createdAt, expiresAt }
    : null;
}

export async function activateEventInviteMembership({
  supabaseUrl,
  serviceRoleKey,
  invite,
  snapshotId,
  userId,
  fetchImpl = fetch
}) {
  const activated = await activateInviteMembership({
    supabaseUrl,
    serviceRoleKey,
    inviteId: invite?.id,
    token: invite?.token,
    userId,
    fetchImpl
  });
  if (!activated) return false;
  return indexSharedEventForMember({
    supabaseUrl,
    serviceRoleKey,
    snapshotId,
    userId,
    fetchImpl
  });
}

export async function indexSharedEventForMember({
  supabaseUrl,
  serviceRoleKey,
  snapshotId,
  userId,
  fetchImpl = fetch
}) {
  if (
    !isSafeSharedIdentifier(String(snapshotId ?? "")) ||
    !UUID_PATTERN.test(String(userId ?? ""))
  ) {
    return false;
  }
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/index_shared_event_for_member`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_snapshot_id: snapshotId,
        p_user_id: userId
      })
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Shared event member index update failed", {
      status: response.status,
      snapshotId,
      userId,
      detail: detail.slice(0, 500)
    });
  }
  return response.ok;
}

function serverContext(runtimeConfig, env) {
  const supabaseUrl = String(runtimeConfig?.storage?.url ?? "").replace(/\/+$/, "");
  const anonKey = String(runtimeConfig?.storage?.anonKey ?? "").trim();
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ""
  ).trim();
  return supabaseUrl && anonKey && serviceRoleKey
    ? { supabaseUrl, anonKey, serviceRoleKey }
    : null;
}

async function loadAuthenticatedUser({
  supabaseUrl,
  anonKey,
  accessToken,
  fetchImpl
}) {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function loadAccountState({
  supabaseUrl,
  serviceRoleKey,
  userId,
  eventId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    owner_user_id: `eq.${userId}`,
    select: "state",
    order: "updated_at.desc",
    limit: "5"
  });
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/app_snapshots?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.state)
    .find((state) => eventFromState(state, eventId)) ?? null;
}

async function loadActiveInviteByToken({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  spaceId = "",
  token,
  kind = "",
  fetchImpl
}) {
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`,
    token_hash: `eq.${hashInviteToken(token)}`,
    revoked_at: "is.null",
    select:
      "id,event_id,kind,space_id,space_key,created_by,recipient_user_id,created_at,expires_at",
    limit: "1"
  });
  if (kind) params.set("kind", `eq.${kind}`);
  if (spaceId) params.set("space_id", `eq.${spaceId}`);
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/event_invite_tokens?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function loadActiveOpenInvite({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  spaceId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`,
    space_id: `eq.${spaceId}`,
    kind: "eq.open",
    revoked_at: "is.null",
    select: "id,event_id,space_id,space_key,created_by,created_at,token_hash",
    limit: "1"
  });
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/event_invite_tokens?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function loadInviteEventAnchor({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  spaceId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`,
    space_id: `eq.${spaceId}`,
    select: "space_id,space_key",
    order: "created_at.asc",
    limit: "1"
  });
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/event_invite_tokens?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function loadVerifiedSharedEvent({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  spaceId,
  spaceKey,
  fetchImpl
}) {
  const snapshot = await loadSharedEventSnapshot({
    supabaseUrl,
    serviceRoleKey,
    spaceId,
    fetchImpl
  });
  if (
    !snapshot ||
    !secureHashEquals(snapshot.access_key_hash, hashInviteToken(spaceKey))
  ) {
    return null;
  }
  return eventFromState(snapshot.state, eventId);
}

async function loadSharedEventById({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  spaceId,
  fetchImpl
}) {
  const snapshot = await loadSharedEventSnapshot({
    supabaseUrl,
    serviceRoleKey,
    spaceId,
    fetchImpl
  });
  return eventFromState(snapshot?.state, eventId);
}

async function loadSharedEventSnapshot({
  supabaseUrl,
  serviceRoleKey,
  spaceId,
  fetchImpl
}) {
  const params = new URLSearchParams({
    id: `eq.${spaceId}`,
    select: "state,access_key_hash",
    limit: "1"
  });
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/app_snapshots?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function loadMemberAccessibleSharedEvent({
  supabaseUrl,
  serviceRoleKey,
  accessToken,
  eventId,
  spaceId,
  fetchImpl
}) {
  const permissionResponse = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/can_write_shared_snapshot`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: serviceRoleKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({ p_snapshot_id: spaceId })
    }
  );
  if (!permissionResponse.ok) return null;
  const allowed = await permissionResponse.json().catch(() => false);
  if (allowed !== true) return null;

  const params = new URLSearchParams({
    id: `eq.${spaceId}`,
    select: "state,access_key_hash",
    limit: "1"
  });
  const snapshotResponse = await fetchImpl(
    `${supabaseUrl}/rest/v1/app_snapshots?${params}`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!snapshotResponse.ok) return null;
  const rows = await snapshotResponse.json().catch(() => []);
  const snapshot = Array.isArray(rows) ? rows[0] ?? null : null;
  const event = eventFromState(snapshot?.state, eventId);
  // Shared snapshots intentionally omit the raw space key. A recovered device
  // therefore carries only RECOVERED_MEMBER_SPACE_KEY and cannot validate the
  // snapshot directly. After the caller proves live membership, recover the
  // canonical key from the server-only invite history and bind it back to the
  // snapshot hash before allowing any new invite to be created.
  const inviteAnchor = await loadInviteEventAnchor({
    supabaseUrl,
    serviceRoleKey,
    eventId,
    spaceId,
    fetchImpl
  });
  const canonicalSpaceKey = String(inviteAnchor?.space_key ?? "").trim();
  if (!event) {
    return null;
  }
  if (!inviteAnchor) {
    return { event, spaceKey: RECOVERED_MEMBER_SPACE_KEY };
  }
  if (canonicalSpaceKey === RECOVERED_MEMBER_SPACE_KEY) {
    return { event, spaceKey: canonicalSpaceKey };
  }
  if (
    !isSafeSharedIdentifier(canonicalSpaceKey) ||
    !secureHashEquals(snapshot?.access_key_hash, hashInviteToken(canonicalSpaceKey))
  ) return null;
  return { event, spaceKey: canonicalSpaceKey };
}

async function rotateOpenInviteRow({
  supabaseUrl,
  serviceRoleKey,
  eventId,
  userId,
  token,
  spaceId,
  spaceKey,
  createdAt,
  fetchImpl
}) {
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/rotate_open_event_invite`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_event_id: eventId,
        p_created_by: userId,
        p_token_hash: hashInviteToken(token),
        p_space_id: spaceId,
        p_space_key: spaceKey,
        p_created_at: createdAt
      })
    }
  );
  return response.ok;
}

async function activateInviteMembership({
  supabaseUrl,
  serviceRoleKey,
  inviteId,
  token,
  userId,
  fetchImpl
}) {
  if (
    !UUID_PATTERN.test(String(inviteId ?? "")) ||
    !UUID_PATTERN.test(String(userId ?? "")) ||
    !normalizeInviteToken(token)
  ) {
    return false;
  }
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/redeem_event_invite_membership`,
    {
      method: "POST",
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_invite_id: inviteId,
        p_token_hash: hashInviteToken(token),
        p_user_id: userId
      })
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Open event invite membership activation failed", {
      status: response.status,
      inviteId,
      userId,
      detail: detail.slice(0, 500)
    });
  }
  return response.ok;
}

async function revokeInviteRow({
  supabaseUrl,
  serviceRoleKey,
  inviteId,
  fetchImpl
}) {
  if (!UUID_PATTERN.test(String(inviteId ?? ""))) return;
  const now = new Date().toISOString();
  await fetchImpl(
    `${supabaseUrl}/rest/v1/event_invite_tokens?id=eq.${inviteId}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        revoked_at: now,
        updated_at: now
      })
    }
  );
}

function canCreateOpenInvite(state, event, participantId) {
  if (
    event?.locked === true ||
    Boolean(event?.closedAt) ||
    !event?.participantIds?.includes(participantId) ||
    event.inactiveParticipantIds?.includes(participantId)
  ) {
    return false;
  }
  const group = state?.groups?.find((item) => item.id === event.groupId);
  const adminIds = group?.adminIds?.length
    ? group.adminIds
    : event.adminIds?.length
      ? event.adminIds
      : [event.createdByParticipantId].filter(Boolean);
  return !event.adminsCanEditOnly || adminIds.includes(participantId);
}

function secureHashEquals(value, expected) {
  const actualBuffer = Buffer.from(String(value ?? ""));
  const expectedBuffer = Buffer.from(String(expected ?? ""));
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isActiveEventParticipant(event, participantId) {
  return Boolean(
    participantId &&
    event?.participantIds?.includes(participantId) &&
    !(event.inactiveParticipantIds ?? []).includes(participantId)
  );
}

function sameInviteCredentials(invite, { spaceId, spaceKey }) {
  return (
    String(invite?.space_id ?? "") === spaceId &&
    String(invite?.space_key ?? "") === spaceKey
  );
}

function eventFromState(state, eventId) {
  return Array.isArray(state?.events)
    ? state.events.find((event) => event?.id === eventId) ?? null
    : null;
}

function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

function normalizeInviteToken(value) {
  const token = String(value ?? "").trim();
  return INVITE_TOKEN_PATTERN.test(token) ? token : null;
}

function hashInviteToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json"
  };
}

function bearerToken(value) {
  return String(value).match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? "";
}

function success(payload) {
  return {
    ok: true,
    status: 200,
    payload: { ok: true, ...payload }
  };
}

function failure(status, error, details = {}) {
  return {
    ok: false,
    status,
    payload: { ok: false, error, ...details }
  };
}
