import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX,
  ACCOUNT_OAUTH_FLOW_TTL_MS,
  ACCOUNT_SESSION_STORAGE_KEY,
  ACCOUNT_SESSION_SYNC_STORAGE_KEY,
  accountProfileFromUser,
  accountStorageIdentityFromSession,
  activateStoredAccountWorkspace,
  appleOAuthUrl,
  accountAuthErrorMessage,
  clearAccountWorkspace,
  clearAccountOAuthFlow,
  createAccountOAuthFlowId,
  createAccountWorkspace,
  createOAuthPkce,
  createOAuthPkceChallenge,
  loadStoredAccountSession,
  parseAccountSessionSync,
  publishAccountSessionSync,
  saveAccountSession,
  deleteAccount,
  exchangeOAuthCode,
  googleOAuthUrl,
  LEGACY_STATE_CLAIM_PREFIX,
  loadAccountOAuthFlow,
  saveAccountOAuthFlow,
  signInWithIdToken,
  signInWithPassword,
  signUpWithPassword
} from "../src/data/accountAuth.mjs";
import {
  CLIENT_SPACE_KEY_STORAGE_PREFIX,
  CLIENT_SPACE_STORAGE_KEY
} from "../src/domain/cloudSpace.mjs";

const config = {
  storage: {
    mode: "supabase",
    url: "https://project.supabase.co",
    anonKey: "publishable-key"
  }
};

test("account session sync publishes only a completed identity change", () => {
  const storage = memoryStorage();
  const payload = publishAccountSessionSync(
    { user: { id: "user-2" } },
    {
      storage,
      now: () => 1234,
      randomId: () => "sync-1"
    }
  );

  assert.deepEqual(payload, {
    reason: "signed-in",
    userId: "user-2",
    at: 1234,
    id: "sync-1"
  });
  assert.deepEqual(
    parseAccountSessionSync(storage.getItem(ACCOUNT_SESSION_SYNC_STORAGE_KEY)),
    payload
  );
});

test("account session sync distinguishes sign-out and rejects malformed messages", () => {
  const storage = memoryStorage();
  const payload = publishAccountSessionSync(null, {
    reason: "signed-out",
    storage,
    now: () => 5678,
    randomId: () => "sync-2"
  });

  assert.equal(payload.userId, "");
  assert.equal(payload.reason, "signed-out");
  assert.equal(parseAccountSessionSync("not-json"), null);
  assert.equal(
    parseAccountSessionSync(JSON.stringify({
      reason: "signed-in",
      userId: "",
      at: 1,
      id: "bad"
    })),
    null
  );
});

test("account session keeps the Supabase user and activates its cloud workspace", () => {
  const storage = memoryStorage();
  const session = saveAccountSession({
    access_token: "access",
    refresh_token: "refresh",
    expires_at: 9999999999,
    user: {
      id: "user-1",
      email: "USER@example.com",
      user_metadata: {
        full_name: "ירין יצחק",
        account_space_id: "space-account-one",
        account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
      }
    }
  }, storage);

  assert.equal(loadStoredAccountSession(storage).user.id, "user-1");
  assert.equal(
    activateStoredAccountWorkspace({
      storage,
      currentUrl: "https://app.example.com/"
    }),
    true
  );
  assert.equal(storage.getItem(CLIENT_SPACE_STORAGE_KEY), "space-account-one");
  assert.equal(
    storage.getItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}space-account-one`),
    "abcdefghijklmnopqrstuvwxyzABCDEF"
  );
  assert.ok(storage.getItem(ACCOUNT_SESSION_STORAGE_KEY));
  assert.equal(session.user.email, "USER@example.com");
});

test("an event invite never replaces the signed-in account workspace", () => {
  const storage = memoryStorage();
  saveAccountSession({
    access_token: "access",
    refresh_token: "refresh",
    user: {
      id: "user-1",
      user_metadata: {
        account_space_id: "space-account-one",
        account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
      }
    }
  }, storage);

  assert.equal(
    activateStoredAccountWorkspace({
      storage,
      currentUrl: "https://app.example.com/?space=space-invite"
    }),
    true
  );
  assert.equal(storage.getItem(CLIENT_SPACE_STORAGE_KEY), "space-account-one");
});

test("a new account workspace explicitly claims existing guest state", () => {
  const storage = memoryStorage();
  storage.setItem("settle-friends-state", JSON.stringify({ events: [] }));

  const workspace = createAccountWorkspace({ storage });

  assert.equal(
    storage.getItem(`${LEGACY_STATE_CLAIM_PREFIX}${workspace.id}`),
    "1"
  );
});

test("account profile uses one stable participant id for email and Google login", () => {
  assert.deepEqual(
    accountProfileFromUser({
      id: "auth-user-1",
      email: "USER@Example.com",
      app_metadata: { provider: "email" },
      user_metadata: { full_name: "ירין יצחק" }
    }),
    {
      participantId: "account-auth-user-1",
      displayName: "ירין יצחק",
      authProvider: "email",
      authSubject: "auth-user-1",
      email: "user@example.com"
    }
  );
});

test("Apple login keeps the same account identity model", () => {
  const profile = accountProfileFromUser({
    id: "apple-user-1",
    email: "private@privaterelay.appleid.com",
    app_metadata: { provider: "apple" },
    user_metadata: { full_name: "ירין יצחק" }
  });

  assert.equal(profile.authProvider, "apple");
  assert.equal(profile.participantId, "account-apple-user-1");
  assert.match(appleOAuthUrl(config, "https://app.example.com/"), /provider=apple/);
});

test("Google login always asks which account to use on a shared device", () => {
  const googleUrl = new URL(
    googleOAuthUrl(config, "https://app.example.com/auth/callback")
  );
  const appleUrl = new URL(
    appleOAuthUrl(config, "https://app.example.com/auth/callback")
  );

  assert.equal(googleUrl.searchParams.get("prompt"), "select_account");
  assert.equal(appleUrl.searchParams.has("prompt"), false);
});

test("native Google ID tokens create the same Supabase account session", async () => {
  let request = null;
  const session = await signInWithIdToken(
    config,
    {
      provider: "google",
      token: "google-id-token",
      accessToken: "google-access-token"
    },
    async (url, options) => {
      request = { url, options };
      return jsonResponse(200, {
        access_token: "supabase-access",
        refresh_token: "supabase-refresh",
        expires_in: 3600,
        user: { id: "google-user" }
      });
    }
  );

  assert.match(request.url, /\/token\?grant_type=id_token$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    provider: "google",
    id_token: "google-id-token",
    access_token: "google-access-token"
  });
  assert.equal(session.access_token, "supabase-access");
  assert.equal(session.user.id, "google-user");
});

test("OAuth uses a one-time PKCE verifier instead of returning reusable tokens", async () => {
  const pkce = await createOAuthPkce();
  const url = new URL(
    googleOAuthUrl(config, "https://app.example.com/auth/callback", {
      codeChallenge: pkce.challenge
    })
  );

  assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(pkce.challenge, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(await createOAuthPkceChallenge(pkce.verifier), pkce.challenge);
  assert.equal(url.searchParams.get("code_challenge"), pkce.challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
});

test("OAuth callback exchanges its code with the matching PKCE verifier", async () => {
  let request = null;
  const session = await exchangeOAuthCode(
    config,
    "one-time-code",
    "one-time-verifier",
    async (url, options) => {
      request = { url, options };
      return jsonResponse(200, {
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600
      });
    }
  );

  assert.match(request.url, /\/token\?grant_type=pkce$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    auth_code: "one-time-code",
    code_verifier: "one-time-verifier"
  });
  assert.equal(session.access_token, "access");
});

test("simultaneous OAuth attempts keep independent PKCE verifiers and return paths", async () => {
  const storage = memoryStorage();
  const firstPkce = await createOAuthPkce();
  const secondPkce = await createOAuthPkce();
  const firstId = createAccountOAuthFlowId();
  const secondId = createAccountOAuthFlowId();

  assert.notEqual(firstId, secondId);
  assert.match(firstId, /^[A-Za-z0-9_-]{20,128}$/);
  saveAccountOAuthFlow({
    id: firstId,
    verifier: firstPkce.verifier,
    returnPath: "/?event=first",
    createdAt: 1_000
  }, storage);
  saveAccountOAuthFlow({
    id: secondId,
    verifier: secondPkce.verifier,
    returnPath: "/?event=second",
    createdAt: 2_000
  }, storage);

  assert.equal(
    loadAccountOAuthFlow(firstId, storage, 2_001)?.verifier,
    firstPkce.verifier
  );
  assert.equal(
    loadAccountOAuthFlow(secondId, storage, 2_001)?.returnPath,
    "/?event=second"
  );

  clearAccountOAuthFlow(firstId, storage);
  assert.equal(loadAccountOAuthFlow(firstId, storage, 2_001), null);
  assert.equal(
    loadAccountOAuthFlow(secondId, storage, 2_001)?.verifier,
    secondPkce.verifier
  );
});

test("OAuth flow storage rejects redirects outside the app and expires old attempts", async () => {
  const storage = memoryStorage();
  const pkce = await createOAuthPkce();
  const id = createAccountOAuthFlowId();

  assert.equal(saveAccountOAuthFlow({
    id,
    verifier: pkce.verifier,
    returnPath: "https://attacker.example/",
    createdAt: 1_000
  }, storage), null);

  saveAccountOAuthFlow({
    id,
    verifier: pkce.verifier,
    returnPath: "/events",
    createdAt: 1_000
  }, storage);
  assert.equal(
    loadAccountOAuthFlow(id, storage, 1_000 + ACCOUNT_OAUTH_FLOW_TTL_MS + 1),
    null
  );
  assert.equal(
    storage.getItem(`${ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX}${id}`),
    null
  );
});

test("current signed-in session marks only its account cloud space as owned", () => {
  assert.deepEqual(accountStorageIdentityFromSession({
    access_token: "access",
    refresh_token: "refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "user-1",
      user_metadata: {
        account_space_id: "space-account-one",
        account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
      }
    }
  }), {
    userId: "user-1",
    accessToken: "access",
    spaceId: "space-account-one"
  });
});

test("account deletion calls the protected same-origin endpoint", async () => {
  let request = null;
  const result = await deleteAccount(config, { access_token: "access" }, async (url, options) => {
    request = { url, options };
    return jsonResponse(200, { ok: true, accountDeleted: true });
  });

  assert.equal(result.accountDeleted, true);
  assert.equal(request.url, "/api/account");
  assert.equal(request.options.method, "DELETE");
  assert.equal(request.options.headers.authorization, "Bearer access");
});

test("native account deletion uses the production API origin", async () => {
  let requestUrl = "";
  await deleteAccount(
    { ...config, apiBaseUrl: "https://sogrim-hashbon.vercel.app" },
    { access_token: "access" },
    async (url) => {
      requestUrl = url;
      return jsonResponse(200, { ok: true, accountDeleted: true });
    }
  );

  assert.equal(requestUrl, "https://sogrim-hashbon.vercel.app/api/account");
});

test("signing out removes the active account workspace from a shared device", () => {
  const storage = memoryStorage();
  const user = {
    user_metadata: {
      account_space_id: "space-account-one",
      account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
    }
  };
  storage.setItem(CLIENT_SPACE_STORAGE_KEY, "space-account-one");
  storage.setItem(
    `${CLIENT_SPACE_KEY_STORAGE_PREFIX}space-account-one`,
    "abcdefghijklmnopqrstuvwxyzABCDEF"
  );

  clearAccountWorkspace(user, storage);

  assert.equal(storage.getItem(CLIENT_SPACE_STORAGE_KEY), null);
  assert.equal(
    storage.getItem(`${CLIENT_SPACE_KEY_STORAGE_PREFIX}space-account-one`),
    null
  );
});

test("password signup attaches the existing workspace to the new account", async () => {
  let request = null;
  const result = await signUpWithPassword(
    config,
    {
      email: "user@example.com",
      password: "long-password",
      displayName: "ירין יצחק",
      redirectTo: "https://app.example.com/",
      workspace: {
        id: "space-existing",
        key: "abcdefghijklmnopqrstuvwxyzABCDEF"
      }
    },
    async (url, options) => {
      request = { url, options };
      return jsonResponse(200, { user: { id: "new-user" } });
    }
  );

  assert.equal(result.session, null);
  assert.match(request.url, /\/auth\/v1\/signup\?redirect_to=/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.data.full_name, "ירין יצחק");
  assert.equal(body.data.account_space_id, "space-existing");
  assert.equal(body.data.account_space_key, "abcdefghijklmnopqrstuvwxyzABCDEF");
});

test("separate pending signups on one device never share a workspace", async () => {
  const storage = memoryStorage();
  storage.setItem(CLIENT_SPACE_STORAGE_KEY, "space-first-signup");
  storage.setItem(
    `${CLIENT_SPACE_KEY_STORAGE_PREFIX}space-first-signup`,
    "abcdefghijklmnopqrstuvwxyzABCDEF"
  );
  const requests = [];
  const fetchSignup = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return jsonResponse(200, { user: { id: `user-${requests.length}` } });
  };

  await signUpWithPassword(
    config,
    {
      email: "first@example.com",
      password: "long-password",
      displayName: "First Account",
      storage
    },
    fetchSignup
  );
  await signUpWithPassword(
    config,
    {
      email: "second@example.com",
      password: "long-password",
      displayName: "Second Account",
      storage
    },
    fetchSignup
  );

  assert.equal(requests[0].data.account_space_id, "space-first-signup");
  assert.notEqual(
    requests[1].data.account_space_id,
    requests[0].data.account_space_id
  );
  assert.notEqual(
    requests[1].data.account_space_key,
    requests[0].data.account_space_key
  );
  assert.equal(
    storage.getItem(CLIENT_SPACE_STORAGE_KEY),
    requests[1].data.account_space_id
  );
});

test("password login stores a refreshable Supabase session", async () => {
  const session = await signInWithPassword(
    config,
    { email: "user@example.com", password: "long-password" },
    async () => jsonResponse(200, {
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
      user: { id: "user-1" }
    })
  );

  assert.equal(session.access_token, "access");
  assert.equal(session.user.id, "user-1");
  assert.ok(session.expires_at > Math.floor(Date.now() / 1000));
});

test("account auth errors stay helpful without exposing account existence", () => {
  assert.equal(
    accountAuthErrorMessage(new Error("Invalid login credentials")),
    "האימייל או הסיסמה אינם נכונים."
  );
  assert.equal(
    accountAuthErrorMessage(new Error("Email not confirmed")),
    "צריך לאשר את המייל לפני ההתחברות."
  );
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
