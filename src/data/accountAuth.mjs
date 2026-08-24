import {
  CLIENT_SPACE_KEY_STORAGE_PREFIX,
  CLIENT_SPACE_STORAGE_KEY,
  createClientSpaceId,
  createClientSpaceKey,
  normalizeSpaceId,
  normalizeSpaceKey
} from "../domain/cloudSpace.mjs";
import { fetchWithTimeout } from "./fetchTimeout.mjs";
import { normalizeAvatarImage } from "../domain/avatarPresets.mjs";
import { normalizeUsername } from "../domain/usernames.mjs";

export const ACCOUNT_SESSION_STORAGE_KEY = "settle-friends-account-session";
export const ACCOUNT_RETURN_URL_STORAGE_KEY = "settle-friends-account-return-url";
export const ACCOUNT_SESSION_SYNC_STORAGE_KEY = "settle-friends-account-session-sync";
export const ACCOUNT_OAUTH_FLOW_QUERY_PARAM = "auth_flow";
export const ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX = "settle-friends-account-oauth-flow:";
export const ACCOUNT_OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
export const ACCOUNT_RECOVERY_FLOW_PURPOSE = "password-recovery";
const SIGNUP_WORKSPACE_CLAIM_PREFIX = "settle-friends-signup-workspace-claimed:";
export const LEGACY_STATE_CLAIM_PREFIX = "settle-friends-legacy-state-claim:";
const LEGACY_STATE_STORAGE_KEY = "settle-friends-state";

export function loadStoredAccountSession(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ACCOUNT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return normalizeSession(session);
  } catch {
    return null;
  }
}

export function saveAccountSession(session, storage = globalThis.localStorage) {
  const normalized = normalizeSession(session);
  if (!normalized) return null;
  storage?.setItem(ACCOUNT_SESSION_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearAccountSession(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(ACCOUNT_SESSION_STORAGE_KEY);
  } catch {}
}

export function publishAccountSessionSync(
  session,
  {
    reason = session?.user?.id ? "signed-in" : "signed-out",
    storage = globalThis.localStorage,
    now = Date.now,
    randomId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  } = {}
) {
  const payload = {
    reason: ["switching", "signed-in", "signed-out", "deleted"].includes(reason)
      ? reason
      : "signed-in",
    userId: String(session?.user?.id ?? "").trim(),
    at: Number(now()) || Date.now(),
    id: String(randomId() ?? "").trim()
  };
  try {
    storage?.setItem(ACCOUNT_SESSION_SYNC_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function parseAccountSessionSync(value) {
  try {
    const payload = JSON.parse(String(value ?? ""));
    const reason = String(payload?.reason ?? "");
    const userId = String(payload?.userId ?? "").trim();
    const at = Number(payload?.at ?? 0);
    const id = String(payload?.id ?? "").trim();
    if (!["switching", "signed-in", "signed-out", "deleted"].includes(reason)) return null;
    if (["switching", "signed-in"].includes(reason) && !userId) return null;
    if (!Number.isFinite(at) || at <= 0 || !id) return null;
    return { reason, userId, at, id };
  } catch {
    return null;
  }
}

export function activateStoredAccountWorkspace({
  storage = globalThis.localStorage
} = {}) {
  const session = loadStoredAccountSession(storage);
  const workspace = accountWorkspaceFromUser(session?.user);
  if (!workspace) return false;

  return activateAccountWorkspace(workspace, { storage });
}

export function activateAccountWorkspace(workspace, {
  storage = globalThis.localStorage
} = {}) {
  const id = normalizeSpaceId(workspace?.id);
  const key = normalizeSpaceKey(workspace?.key);
  if (!id || !key) return false;

  storage?.setItem(CLIENT_SPACE_STORAGE_KEY, id);
  storage?.setItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}${id}`, key);
  return true;
}

export function accountWorkspaceFromUser(user) {
  const metadata = user?.user_metadata ?? {};
  const id = normalizeSpaceId(metadata.account_space_id);
  const key = normalizeSpaceKey(metadata.account_space_key);
  return id && key ? { id, key } : null;
}

export function createAccountWorkspace({
  storage = globalThis.localStorage
} = {}) {
  const storedSpaceId = normalizeSpaceId(storage?.getItem(CLIENT_SPACE_STORAGE_KEY));
  const id = storedSpaceId ?? createClientSpaceId();
  const storedKey = normalizeSpaceKey(
    storage?.getItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}${id}`)
  );
  const key = storedKey ?? createClientSpaceKey();

  storage?.setItem(CLIENT_SPACE_STORAGE_KEY, id);
  storage?.setItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}${id}`, key);
  rememberLegacyStateClaim(id, storage);
  return { id, key };
}

function rememberLegacyStateClaim(spaceId, storage) {
  try {
    if (!spaceId || !storage?.getItem(LEGACY_STATE_STORAGE_KEY)) return;
    storage.setItem(`${LEGACY_STATE_CLAIM_PREFIX}${spaceId}`, "1");
  } catch {}
}

export function clearAccountWorkspace(user, storage = globalThis.localStorage) {
  try {
    const workspace = accountWorkspaceFromUser(user);
    const activeSpaceId = normalizeSpaceId(storage?.getItem(CLIENT_SPACE_STORAGE_KEY));
    if (workspace?.id) {
      storage?.removeItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}${workspace.id}`);
      storage?.removeItem(`${LEGACY_STATE_CLAIM_PREFIX}${workspace.id}`);
    }
    if (!workspace?.id || activeSpaceId === workspace.id) {
      storage?.removeItem(CLIENT_SPACE_STORAGE_KEY);
    }
  } catch {}
}

export function accountProfileFromUser(user) {
  if (!user?.id) return null;
  const metadata = user.user_metadata ?? {};
  const displayName = String(
    metadata.full_name ?? metadata.name ?? metadata.display_name ?? ""
  ).trim();
  const provider = normalizeAccountProvider(user.app_metadata?.provider);
  const username = normalizeUsername(metadata.username);
  const avatarImage = normalizeAvatarImage(metadata.avatar_image);

  return {
    participantId: `account-${user.id}`,
    displayName,
    ...(username ? { username } : {}),
    ...(avatarImage ? { avatarImage } : {}),
    authProvider: provider,
    authSubject: String(user.id),
    email: String(user.email ?? "").trim().toLowerCase()
  };
}

export function accountStorageIdentityFromSession(session) {
  const workspace = accountWorkspaceFromUser(session?.user);
  const accessToken = String(session?.access_token ?? "").trim();
  const userId = String(session?.user?.id ?? "").trim();
  const expiresAt = Number(session?.expires_at ?? 0);
  const sessionIsCurrent = !expiresAt || expiresAt > Math.floor(Date.now() / 1000) + 30;
  if (!workspace || !accessToken || !userId || !sessionIsCurrent) return null;

  return {
    userId,
    accessToken,
    spaceId: workspace.id
  };
}

export async function signUpWithPassword(config, options, fetchImpl = fetch) {
  const {
    email,
    password,
    displayName,
    username,
    redirectTo,
    workspace,
    storage = globalThis.localStorage
  } = options;
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("username required");
  }
  const signupWorkspace = workspace ?? createSignupWorkspace({ storage });
  const signupPath = redirectTo
    ? `/signup?redirect_to=${encodeURIComponent(redirectTo)}`
    : "/signup";
  const response = await authRequest(config, signupPath, {
    method: "POST",
    body: {
      email,
      password,
      data: {
        full_name: displayName,
        username: normalizedUsername,
        account_space_id: signupWorkspace.id,
        account_space_key: signupWorkspace.key
      }
    }
  }, fetchImpl);
  rememberClaimedSignupWorkspace(signupWorkspace, storage);

  return {
    user: response.user ?? null,
    session: sessionFromAuthResponse(response)
  };
}

function createSignupWorkspace({ storage }) {
  const activeWorkspace = createAccountWorkspace({ storage });
  if (!isSignupWorkspaceClaimed(activeWorkspace.id, storage)) {
    return activeWorkspace;
  }

  const workspace = {
    id: createClientSpaceId(),
    key: createClientSpaceKey()
  };
  activateAccountWorkspace(workspace, { storage });
  return workspace;
}

function isSignupWorkspaceClaimed(spaceId, storage) {
  try {
    return storage?.getItem(`${SIGNUP_WORKSPACE_CLAIM_PREFIX}${spaceId}`) === "1";
  } catch {
    return false;
  }
}

function rememberClaimedSignupWorkspace(workspace, storage) {
  try {
    storage?.setItem(
      `${SIGNUP_WORKSPACE_CLAIM_PREFIX}${workspace.id}`,
      "1"
    );
  } catch {}
}

export async function signInWithPassword(
  config,
  { email, password },
  fetchImpl = fetch
) {
  const response = await authRequest(config, "/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  }, fetchImpl);
  return sessionFromAuthResponse(response);
}

export async function signInWithIdToken(
  config,
  { provider, token, accessToken = "", nonce = "" },
  fetchImpl = fetch
) {
  const safeProvider = String(provider ?? "").trim();
  const safeToken = String(token ?? "").trim();
  if (!safeProvider || !safeToken) {
    throw new Error("Identity token is unavailable");
  }

  const body = {
    provider: safeProvider,
    id_token: safeToken
  };
  if (accessToken) body.access_token = String(accessToken);
  if (nonce) body.nonce = String(nonce);

  const response = await authRequest(
    config,
    "/token?grant_type=id_token",
    { method: "POST", body },
    fetchImpl
  );
  return sessionFromAuthResponse(response);
}

export async function refreshAccountSession(config, session, fetchImpl = fetch) {
  if (!session?.refresh_token) return null;
  const response = await authRequest(config, "/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: session.refresh_token }
  }, fetchImpl);
  return sessionFromAuthResponse(response);
}

export async function loadAccountUser(config, session, fetchImpl = fetch) {
  if (!session?.access_token) return null;
  return authRequest(config, "/user", {
    method: "GET",
    accessToken: session.access_token
  }, fetchImpl);
}

export async function updateAccountUser(config, session, data, fetchImpl = fetch) {
  const user = await authRequest(config, "/user", {
    method: "PUT",
    accessToken: session.access_token,
    body: { data }
  }, fetchImpl);
  return {
    ...session,
    user
  };
}

export async function updateAccountPassword(
  config,
  session,
  password,
  fetchImpl = fetch
) {
  const user = await authRequest(config, "/user", {
    method: "PUT",
    accessToken: session.access_token,
    body: { password }
  }, fetchImpl);
  return { ...session, user };
}

export async function requestPasswordReset(
  config,
  email,
  redirectTo,
  fetchImpl = fetch
) {
  const path = redirectTo
    ? `/recover?redirect_to=${encodeURIComponent(redirectTo)}`
    : "/recover";
  await authRequest(config, path, {
    method: "POST",
    body: { email }
  }, fetchImpl);
  return true;
}

export async function ensureAccountWorkspace(config, session, options = {}) {
  const existing = accountWorkspaceFromUser(session?.user);
  if (existing) {
    activateAccountWorkspace(existing, {
      storage: options.storage,
      currentUrl: options.currentUrl
    });
    return session;
  }

  // Never reuse the globally active space when repairing an authenticated
  // account. It may belong to a different user from an earlier session on the
  // same browser. Signup has its own explicit legacy-state claim flow.
  const workspace = {
    id: createClientSpaceId(),
    key: createClientSpaceKey()
  };
  activateAccountWorkspace(workspace, {
    storage: options.storage,
    currentUrl: options.currentUrl
  });
  const currentMetadata = session?.user?.user_metadata ?? {};
  const nextSession = await updateAccountUser(config, session, {
    ...currentMetadata,
    account_space_id: workspace.id,
    account_space_key: workspace.key
  }, options.fetchImpl ?? fetch);
  saveAccountSession(nextSession, options.storage);
  activateAccountWorkspace(workspace, {
    storage: options.storage,
    currentUrl: options.currentUrl
  });
  return nextSession;
}

export async function signOutAccount(
  config,
  session,
  fetchImpl = fetch,
  storage = globalThis.localStorage
) {
  // Remove locally reusable credentials before the best-effort network logout.
  // A slow or offline request must not let startup restore the old account.
  clearAccountSession(storage);
  clearAccountWorkspace(session?.user, storage);
  if (session?.access_token) {
    try {
      await authRequest(config, "/logout", {
        method: "POST",
        accessToken: session.access_token
      }, fetchImpl);
    } catch {}
  }
}

export function googleOAuthUrl(config, redirectTo, options = {}) {
  return accountOAuthUrl(config, "google", redirectTo, options);
}

export function appleOAuthUrl(config, redirectTo, options = {}) {
  return accountOAuthUrl(config, "apple", redirectTo, options);
}

export async function createOAuthPkce(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.getRandomValues || !cryptoImpl?.subtle) {
    throw new Error("Secure OAuth is unavailable");
  }
  const randomBytes = new Uint8Array(48);
  cryptoImpl.getRandomValues(randomBytes);
  const verifier = base64Url(randomBytes);
  return {
    verifier,
    challenge: await createOAuthPkceChallenge(verifier, cryptoImpl)
  };
}

export function createAccountOAuthFlowId(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.getRandomValues) {
    throw new Error("Secure OAuth is unavailable");
  }
  const randomBytes = new Uint8Array(18);
  cryptoImpl.getRandomValues(randomBytes);
  return base64Url(randomBytes);
}

export function saveAccountOAuthFlow(
  {
    id,
    verifier,
    returnPath,
    purpose = "oauth",
    email = "",
    createdAt = Date.now()
  },
  storage = globalThis.localStorage
) {
  const storageKey = accountOAuthFlowStorageKey(id);
  const safeVerifier = String(verifier ?? "").trim();
  const safeReturnPath = normalizeAccountReturnPath(returnPath);
  const safePurpose = ["oauth", ACCOUNT_RECOVERY_FLOW_PURPOSE].includes(purpose)
    ? purpose
    : "";
  const safeEmail = String(email ?? "").trim().toLowerCase();
  const safeCreatedAt = Number(createdAt);
  if (
    !storageKey ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(safeVerifier) ||
    !safeReturnPath ||
    !safePurpose ||
    (safePurpose === ACCOUNT_RECOVERY_FLOW_PURPOSE && !validRecoveryEmail(safeEmail)) ||
    !Number.isFinite(safeCreatedAt)
  ) {
    return null;
  }

  const flow = {
    id: String(id),
    verifier: safeVerifier,
    returnPath: safeReturnPath,
    purpose: safePurpose,
    email: safePurpose === ACCOUNT_RECOVERY_FLOW_PURPOSE ? safeEmail : "",
    createdAt: safeCreatedAt
  };
  try {
    storage?.setItem(storageKey, JSON.stringify(flow));
    return flow;
  } catch {
    return null;
  }
}

export function loadAccountOAuthFlow(
  id,
  storage = globalThis.localStorage,
  now = Date.now()
) {
  const storageKey = accountOAuthFlowStorageKey(id);
  if (!storageKey) return null;
  try {
    const flow = JSON.parse(storage?.getItem(storageKey) ?? "null");
    const createdAt = Number(flow?.createdAt);
    const purpose = String(flow?.purpose ?? "oauth");
    const email = String(flow?.email ?? "").trim().toLowerCase();
    const valid =
      flow?.id === String(id) &&
      /^[A-Za-z0-9_-]{43,128}$/.test(String(flow?.verifier ?? "")) &&
      Boolean(normalizeAccountReturnPath(flow?.returnPath)) &&
      ["oauth", ACCOUNT_RECOVERY_FLOW_PURPOSE].includes(purpose) &&
      (purpose !== ACCOUNT_RECOVERY_FLOW_PURPOSE || validRecoveryEmail(email)) &&
      Number.isFinite(createdAt) &&
      Number(now) >= createdAt &&
      Number(now) - createdAt <= ACCOUNT_OAUTH_FLOW_TTL_MS;
    if (!valid) {
      storage?.removeItem(storageKey);
      return null;
    }
    return {
      id: flow.id,
      verifier: flow.verifier,
      returnPath: normalizeAccountReturnPath(flow.returnPath),
      purpose,
      email: purpose === ACCOUNT_RECOVERY_FLOW_PURPOSE ? email : "",
      createdAt
    };
  } catch {
    try {
      storage?.removeItem(storageKey);
    } catch {}
    return null;
  }
}

export function clearAccountOAuthFlow(
  id,
  storage = globalThis.localStorage
) {
  const storageKey = accountOAuthFlowStorageKey(id);
  if (!storageKey) return false;
  try {
    storage?.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export function clearAccountOAuthFlows(storage = globalThis.localStorage) {
  try {
    const keys = [];
    for (let index = 0; index < Number(storage?.length ?? 0); index += 1) {
      const key = storage?.key(index);
      if (String(key ?? "").startsWith(ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) storage?.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}

export async function createOAuthPkceChallenge(
  verifier,
  cryptoImpl = globalThis.crypto
) {
  if (!verifier || !cryptoImpl?.subtle) {
    throw new Error("Secure OAuth is unavailable");
  }
  const challengeBytes = new Uint8Array(
    await cryptoImpl.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier)
    )
  );
  return base64Url(challengeBytes);
}

export async function exchangeOAuthCode(
  config,
  code,
  verifier,
  fetchImpl = fetch
) {
  if (!code || !verifier) return null;
  const response = await authRequest(
    config,
    "/token?grant_type=pkce",
    {
      method: "POST",
      body: {
        auth_code: code,
        code_verifier: verifier
      }
    },
    fetchImpl
  );
  return sessionFromAuthResponse(response);
}

export async function deleteAccount(config, session, fetchImpl = fetch) {
  if (!session?.access_token) throw new Error("Account session is unavailable");
  const response = await fetchWithTimeout(fetchImpl, `${config?.apiBaseUrl ?? ""}/api/account`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ confirmation: "delete-my-account" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? "Account deletion failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function accountOAuthUrl(config, provider, redirectTo, options = {}) {
  const url = new URL(`${authBaseUrl(config)}/authorize`);
  url.searchParams.set("provider", provider);
  if (provider === "google") {
    url.searchParams.set("prompt", "select_account");
  }
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  if (options.codeChallenge) {
    url.searchParams.set("code_challenge", options.codeChallenge);
    url.searchParams.set("code_challenge_method", "s256");
  }
  return url.toString();
}

function accountOAuthFlowStorageKey(id) {
  const safeId = String(id ?? "").trim();
  return /^[A-Za-z0-9_-]{20,128}$/.test(safeId)
    ? `${ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX}${safeId}`
    : "";
}

function normalizeAccountReturnPath(value) {
  const path = String(value ?? "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

export function sessionFromOAuthHash(hashValue) {
  const params = new URLSearchParams(String(hashValue ?? "").replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const expiresIn = Number(params.get("expires_in") ?? 3600);
  return normalizeSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get("token_type") ?? "bearer",
    expires_at: Math.floor(Date.now() / 1000) + expiresIn
  });
}

export function authCallbackType(hashValue) {
  const params = new URLSearchParams(String(hashValue ?? "").replace(/^#/, ""));
  return params.get("type") ?? "";
}

export function accountAuthErrorMessage(error, mode = "login") {
  const message = String(error?.message ?? "").toLowerCase();
  const status = Number(error?.status ?? 0);
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return "לא הצלחנו להגיע לשירות החשבון. כדאי לבדוק את החיבור ולנסות שוב.";
  }
  if (message.includes("email not confirmed")) return "צריך לאשר את המייל לפני ההתחברות.";
  if (message.includes("invalid login credentials")) return "האימייל או הסיסמה אינם נכונים.";
  if (message.includes("user already registered")) return "כבר קיים חשבון עם האימייל הזה.";
  if (
    message.includes("username is already taken") ||
    message.includes("user_profiles_username_unique") ||
    (mode === "signup" && message.includes("database error"))
  ) {
    return "שם המשתמש הזה כבר תפוס. נסה שם אחר.";
  }
  if (message.includes("password")) return "הסיסמה צריכה להכיל לפחות 8 תווים.";
  if (message.includes("rate limit") || status === 429) {
    return "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.";
  }
  if (mode === "google") {
    if (
      status === 400 ||
      message.includes("developer_error") ||
      message.includes("identity token") ||
      message.includes("invalid audience") ||
      message.includes("google client")
    ) {
      return "הכניסה עם Google לא הושלמה. כדאי לעדכן את האפליקציה, לבחור את החשבון שוב ולנסות.";
    }
    return "לא הצלחנו להתחבר עם Google כרגע. כדאי לנסות שוב.";
  }
  return mode === "signup"
    ? "לא הצלחנו להשלים את ההרשמה כרגע."
    : "לא הצלחנו להתחבר כרגע.";
}

function validRecoveryEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeSession(session) {
  if (!session?.access_token || !session?.refresh_token) return null;
  return {
    access_token: String(session.access_token),
    refresh_token: String(session.refresh_token),
    token_type: String(session.token_type ?? "bearer"),
    expires_at: Number(session.expires_at ?? 0),
    ...(session.user?.id ? { user: session.user } : {})
  };
}

function sessionFromAuthResponse(response) {
  if (!response?.access_token || !response?.refresh_token) return null;
  return normalizeSession({
    ...response,
    expires_at:
      response.expires_at ??
      Math.floor(Date.now() / 1000) + Number(response.expires_in ?? 3600)
  });
}

function normalizeAccountProvider(provider) {
  return ["google", "apple"].includes(String(provider)) ? String(provider) : "email";
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function authRequest(config, path, options, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, `${authBaseUrl(config)}${path}`, {
    method: options.method,
    headers: {
      apikey: config.storage.anonKey,
      "content-type": "application/json",
      ...(options.accessToken
        ? { authorization: `Bearer ${options.accessToken}` }
        : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.msg ?? payload.message ?? payload.error_description ?? payload.error ?? "Auth request failed"
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

function authBaseUrl(config) {
  if (config?.storage?.mode !== "supabase" || !config.storage.url) {
    throw new Error("Account service is unavailable");
  }
  return `${String(config.storage.url).replace(/\/+$/, "")}/auth/v1`;
}
