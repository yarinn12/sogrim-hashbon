import { eventOpenInviteToken } from "./eventInvites.mjs";
import {
  accountStorageIdentityFromSession,
  loadStoredAccountSession
} from "./accountAuth.mjs";

const VERIFIED_TOKEN_STORAGE_PREFIX = "sogrim-open-invite-token:v2:";
const LEGACY_TOKEN_STORAGE_PREFIX = "sogrim-open-invite-token:";
const ACTIVE_ACCOUNT_SCOPE_STORAGE_KEY =
  "sogrim-open-invite-token:v2:active-account-scope";

export function openInviteTokenScope(
  config,
  event,
  storage = globalThis.localStorage
) {
  const account = activeAccountIdentity(config, storage);
  const accountId = String(account?.userId ?? "").trim();
  const accountSpaceId = String(
    account?.spaceId ?? ""
  ).trim();
  const eventSpaceId = String(event?.sharedSpaceId ?? "").trim();
  const eventId = String(event?.id ?? "").trim();
  if (!accountId || !accountSpaceId || !eventSpaceId || !eventId) return null;

  const accountScope = `${accountId}|${accountSpaceId}`;
  const storageKey = `${VERIFIED_TOKEN_STORAGE_PREFIX}${[
    accountId,
    accountSpaceId,
    eventSpaceId,
    eventId
  ].map(encodeURIComponent).join(":")}`;
  return {
    accountId,
    accountSpaceId,
    accountScope,
    eventSpaceId,
    eventId,
    storageKey
  };
}

export function loadVerifiedOpenInviteToken(
  config,
  event,
  storage = globalThis.localStorage
) {
  const scope = openInviteTokenScope(config, event, storage);
  if (!scope || !storage) return null;
  try {
    const record = JSON.parse(storage.getItem(scope.storageKey) ?? "null");
    const token = eventOpenInviteToken({ openInviteToken: record?.token });
    if (
      record?.version !== 2 ||
      record?.verified !== true ||
      record?.accountId !== scope.accountId ||
      record?.accountSpaceId !== scope.accountSpaceId ||
      record?.eventSpaceId !== scope.eventSpaceId ||
      record?.eventId !== scope.eventId ||
      !token
    ) {
      return null;
    }
    return {
      ...scope,
      token,
      verifiedAt: String(record.verifiedAt ?? "")
    };
  } catch {
    return null;
  }
}

export function saveVerifiedOpenInviteToken(
  config,
  event,
  tokenValue,
  storage = globalThis.localStorage
) {
  const scope = openInviteTokenScope(config, event, storage);
  const token = eventOpenInviteToken({ openInviteToken: tokenValue });
  if (!scope || !token || !storage) return null;
  const record = {
    version: 2,
    verified: true,
    accountId: scope.accountId,
    accountSpaceId: scope.accountSpaceId,
    eventSpaceId: scope.eventSpaceId,
    eventId: scope.eventId,
    token,
    verifiedAt: new Date().toISOString()
  };
  try {
    removeConflictingEventRecords(storage, scope);
    storage.setItem(scope.storageKey, JSON.stringify(record));
    storage.removeItem(legacyOpenInviteStorageKey(scope.eventId));
    return { ...scope, token, verifiedAt: record.verifiedAt };
  } catch {
    return null;
  }
}

export function loadLegacyOpenInviteCandidate(
  event,
  storage = globalThis.localStorage
) {
  const eventId = String(event?.id ?? "").trim();
  if (!eventId || !storage) return null;
  try {
    return eventOpenInviteToken({
      openInviteToken: storage.getItem(legacyOpenInviteStorageKey(eventId))
    });
  } catch {
    return null;
  }
}

export function reconcileOpenInviteAccountScope(
  config,
  storage = globalThis.localStorage
) {
  if (!storage) return false;
  const nextAccountScope = activeAccountScope(config, storage);
  try {
    const previousAccountScope = String(
      storage.getItem(ACTIVE_ACCOUNT_SCOPE_STORAGE_KEY) ?? ""
    );
    const changed = Boolean(
      previousAccountScope && previousAccountScope !== nextAccountScope
    );
    if (changed) clearAllOpenInviteTokens(storage);
    if (nextAccountScope) {
      storage.setItem(ACTIVE_ACCOUNT_SCOPE_STORAGE_KEY, nextAccountScope);
    } else {
      storage.removeItem(ACTIVE_ACCOUNT_SCOPE_STORAGE_KEY);
    }
    return changed;
  } catch {
    return false;
  }
}

export function clearAllOpenInviteTokens(
  storage = globalThis.localStorage
) {
  if (!storage) return;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_TOKEN_STORAGE_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {}
}

function activeAccountScope(config, storage) {
  const account = activeAccountIdentity(config, storage);
  const accountId = String(account?.userId ?? "").trim();
  const accountSpaceId = String(account?.spaceId ?? "").trim();
  return accountId && accountSpaceId ? `${accountId}|${accountSpaceId}` : "";
}

function activeAccountIdentity(config, storage) {
  const configuredAccount = config?.storage?.account;
  const configuredUserId = String(configuredAccount?.userId ?? "").trim();
  const configuredSpaceId = String(
    configuredAccount?.spaceId ?? config?.storage?.spaceId ?? ""
  ).trim();
  if (configuredUserId && configuredSpaceId) {
    return { userId: configuredUserId, spaceId: configuredSpaceId };
  }
  return accountStorageIdentityFromSession(loadStoredAccountSession(storage));
}

function removeConflictingEventRecords(storage, scope) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (
      !key?.startsWith(VERIFIED_TOKEN_STORAGE_PREFIX) ||
      key === ACTIVE_ACCOUNT_SCOPE_STORAGE_KEY ||
      key === scope.storageKey
    ) {
      continue;
    }
    try {
      const record = JSON.parse(storage.getItem(key) ?? "null");
      if (
        record?.accountId === scope.accountId &&
        record?.accountSpaceId === scope.accountSpaceId &&
        record?.eventId === scope.eventId
      ) {
        storage.removeItem(key);
      }
    } catch {
      storage.removeItem(key);
    }
  }
}

function legacyOpenInviteStorageKey(eventId) {
  return `sogrim-open-invite-token:${eventId}`;
}
