import {
  buildEventInviteUrl,
  parseInviteEventId,
  parseInviteToken
} from "../domain/inviteLinks.mjs";
import {
  normalizeSpaceId,
  normalizeSpaceKey,
  parseInviteSpaceId,
  parseInviteSpaceKey
} from "../domain/cloudSpace.mjs";
import { fetchWithTimeout } from "./fetchTimeout.mjs";

export const EVENT_OPEN_INVITE_TOKEN_FIELD = "openInviteToken";

export function isEventInviteError(error) {
  const code = String(error?.code ?? "").trim();
  return Boolean(
    code === "AUTH_REQUIRED" ||
    code === "INVALID_EVENT_INVITE" ||
    code === "INVALID_INVITE_RESPONSE" ||
    code === "LEGACY_INVITE_REPLACED" ||
    code.startsWith("EVENT_INVITE_") ||
    code.startsWith("PRIVATE_INVITE_")
  );
}

export function eventOpenInviteToken(event) {
  return normalizeInviteToken(event?.[EVENT_OPEN_INVITE_TOKEN_FIELD]);
}

export function attachOpenInviteToken(event, token) {
  const normalized = normalizeInviteToken(token);
  if (!event || !normalized) return false;
  event[EVENT_OPEN_INVITE_TOKEN_FIELD] = normalized;
  return true;
}

export async function ensureOpenEventInvite(
  config,
  eventId,
  candidateToken = "",
  fetchImpl = fetch
) {
  return manageOpenEventInvite(
    config,
    {
      eventId,
      candidateToken,
      operation: "ensure"
    },
    fetchImpl
  );
}

export async function rotateOpenEventInvite(
  config,
  eventId,
  fetchImpl = fetch
) {
  return manageOpenEventInvite(
    config,
    {
      eventId,
      operation: "rotate"
    },
    fetchImpl
  );
}

export async function resolveEventInviteCredentials(
  config,
  urlValue,
  fetchImpl = fetch,
  { timeoutMs } = {}
) {
  const eventId = parseInviteEventId(urlValue);
  if (!eventId) return null;

  const tokenParameterPresent = inviteTokenParameterPresent(urlValue);
  const token = parseInviteToken(urlValue);
  if (tokenParameterPresent && !token) {
    throw inviteError(
      { code: "INVALID_EVENT_INVITE" },
      400,
      "קישור ההצטרפות אינו תקין."
    );
  }
  if (token) {
    return redeemTokenInvite(config, { eventId, token }, fetchImpl, timeoutMs);
  }

  const legacyId = parseInviteSpaceId(urlValue);
  const legacyKey = parseInviteSpaceKey(urlValue);
  if (legacyId && legacyKey) {
    if (config?.storage?.mode === "supabase") {
      throw inviteError(
        { code: "LEGACY_INVITE_REPLACED" },
        410,
        "זהו קישור ישן. צריך לבקש קישור הצטרפות חדש."
      );
    }
    return { id: legacyId, key: legacyKey, eventId, source: "legacy" };
  }

  return null;
}

async function redeemTokenInvite(
  config,
  { eventId, token },
  fetchImpl,
  timeoutMs
) {
  const account = config?.storage?.account;
  const headers = { "content-type": "application/json" };
  if (account?.accessToken) {
    headers.authorization = `Bearer ${account.accessToken}`;
  }
  const response = await fetchWithTimeout(
    fetchImpl,
    `${config?.apiBaseUrl ?? ""}/api/event-invites/redeem`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ eventId, token })
    },
    timeoutMs
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw inviteError(
      payload,
      response.status,
      "לא הצלחנו לפתוח את קישור ההצטרפות."
    );
  }

  const id = normalizeSpaceId(payload?.spaceId);
  const key = normalizeSpaceKey(payload?.spaceKey);
  if (!id || !key || payload?.eventId !== eventId) {
    throw inviteError(
      { code: "INVALID_INVITE_RESPONSE" },
      502,
      "קישור ההצטרפות החזיר תשובה לא תקינה."
    );
  }
  return { id, key, eventId, source: payload?.kind ?? "open" };
}

function inviteTokenParameterPresent(urlValue) {
  try {
    return new URL(urlValue, "https://invite.invalid/").searchParams.has("t");
  } catch {
    return false;
  }
}

async function manageOpenEventInvite(
  config,
  { eventId, candidateToken = "", operation },
  fetchImpl
) {
  const account = config?.storage?.account;
  if (!account?.userId || !account?.accessToken) {
    throw inviteError(
      { code: "AUTH_REQUIRED" },
      401,
      "צריך להתחבר כדי ליצור קישור פתוח."
    );
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    `${config?.apiBaseUrl ?? ""}/api/event-invites/open-link`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId,
        candidateToken: normalizeInviteToken(candidateToken) ?? "",
        operation
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw inviteError(
      payload,
      response.status,
      "לא הצלחנו להכין את קישור ההצטרפות."
    );
  }

  const token = normalizeInviteToken(payload?.token);
  if (!token || payload?.eventId !== eventId) {
    throw inviteError(
      { code: "INVALID_INVITE_RESPONSE" },
      502,
      "קישור ההצטרפות החזיר תשובה לא תקינה."
    );
  }
  return {
    eventId,
    token,
    createdAt: String(payload?.createdAt ?? ""),
    rotated: Boolean(payload?.rotated)
  };
}

function normalizeInviteToken(value) {
  const token = String(value ?? "").trim();
  if (!token) return null;
  try {
    return parseInviteToken(
      buildEventInviteUrl("https://invite.invalid/", "event", null, {
        inviteToken: token
      })
    );
  } catch {
    return null;
  }
}

function inviteError(payload, status, fallbackMessage) {
  const code = payload?.code || "EVENT_INVITE_FAILED";
  const error = new Error(inviteErrorMessage(code, fallbackMessage));
  error.code = code;
  error.status = status;
  error.retryable = Boolean(payload?.retryable);
  return error;
}

function inviteErrorMessage(code, fallbackMessage) {
  const messages = {
    AUTH_REQUIRED: "צריך להתחבר מחדש כדי להמשיך.",
    INVALID_EVENT_INVITE: "קישור ההצטרפות אינו תקין.",
    EVENT_INVITES_UNAVAILABLE: "ההזמנות אינן זמינות כרגע. כדאי לנסות שוב בעוד רגע.",
    EVENT_INVITE_NOT_ALLOWED: "אין לך הרשאה ליצור קישור פתוח לאירוע הזה.",
    EVENT_INVITE_NOT_READY: "האירוע עדיין מסתנכרן. כדאי לנסות שוב בעוד רגע.",
    EVENT_INVITE_TOKEN_FAILED: "לא הצלחנו ליצור קישור בטוח. כדאי לנסות שוב.",
    EVENT_INVITE_STORAGE_FAILED: "לא הצלחנו לשמור את קישור ההצטרפות. כדאי לנסות שוב.",
    EVENT_INVITE_ACTIVE_REQUIRES_ROTATION: "כבר קיים קישור פתוח לאירוע. אפשר להפיק קישור חדש ולבטל את הקודם.",
    EVENT_INVITE_REVOKED: "קישור ההצטרפות הזה בוטל. צריך לבקש קישור חדש.",
    EVENT_INVITE_EXPIRED: "תוקף קישור ההצטרפות פג. צריך לבקש קישור חדש.",
    EVENT_INVITE_INVALIDATED: "האירוע כבר אינו זמין דרך הקישור הזה.",
    LEGACY_INVITE_REPLACED: "זהו קישור ישן. צריך לבקש קישור הצטרפות חדש.",
    PRIVATE_INVITE_AUTH_REQUIRED: "צריך להתחבר לחשבון שאליו נשלחה ההזמנה.",
    EVENT_INVITE_AUTH_REQUIRED: "צריך להתחבר כדי להצטרף לאירוע.",
    PRIVATE_INVITE_RECIPIENT_MISMATCH: "ההזמנה הפרטית נשלחה לחשבון אחר."
  };
  return messages[code] ?? fallbackMessage;
}
