import {
  CLIENT_SPACE_KEY_STORAGE_PREFIX,
  CLIENT_SPACE_STORAGE_KEY,
  createClientSpaceId,
  createClientSpaceKey,
  normalizeSpaceId,
  normalizeSpaceKey
} from "../domain/cloudSpace.mjs";

export const ACCOUNT_SESSION_STORAGE_KEY = "settle-friends-account-session";
export const ACCOUNT_RETURN_URL_STORAGE_KEY = "settle-friends-account-return-url";

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
  return { id, key };
}

export function clearAccountWorkspace(user, storage = globalThis.localStorage) {
  try {
    const workspace = accountWorkspaceFromUser(user);
    const activeSpaceId = normalizeSpaceId(storage?.getItem(CLIENT_SPACE_STORAGE_KEY));
    if (workspace?.id) {
      storage?.removeItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}${workspace.id}`);
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

  return {
    participantId: `account-${user.id}`,
    displayName,
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

export async function signUpWithPassword(config, {
  email,
  password,
  displayName,
  redirectTo,
  workspace = createAccountWorkspace()
}, fetchImpl = fetch) {
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
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  }, fetchImpl);

  return {
    user: response.user ?? null,
    session: sessionFromAuthResponse(response)
  };
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

  const workspace = createAccountWorkspace(options);
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
  if (session?.access_token) {
    try {
      await authRequest(config, "/logout", {
        method: "POST",
        accessToken: session.access_token
      }, fetchImpl);
    } catch {}
  }
  clearAccountSession(storage);
  clearAccountWorkspace(session?.user, storage);
}

export function googleOAuthUrl(config, redirectTo) {
  return accountOAuthUrl(config, "google", redirectTo);
}

export function appleOAuthUrl(config, redirectTo) {
  return accountOAuthUrl(config, "apple", redirectTo);
}

export async function deleteAccount(config, session, fetchImpl = fetch) {
  if (!session?.access_token) throw new Error("Account session is unavailable");
  const response = await fetchImpl(`${config?.apiBaseUrl ?? ""}/api/account`, {
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

function accountOAuthUrl(config, provider, redirectTo) {
  const url = new URL(`${authBaseUrl(config)}/authorize`);
  url.searchParams.set("provider", provider);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
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
  if (message.includes("email not confirmed")) return "צריך לאשר את המייל לפני ההתחברות.";
  if (message.includes("invalid login credentials")) return "האימייל או הסיסמה אינם נכונים.";
  if (message.includes("user already registered")) return "כבר קיים חשבון עם האימייל הזה.";
  if (message.includes("password")) return "הסיסמה צריכה להכיל לפחות 8 תווים.";
  if (message.includes("rate limit")) return "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.";
  return mode === "signup"
    ? "לא הצלחנו להשלים את ההרשמה כרגע."
    : "לא הצלחנו להתחבר כרגע.";
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

async function authRequest(config, path, options, fetchImpl) {
  const response = await fetchImpl(`${authBaseUrl(config)}${path}`, {
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
