import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX,
  ACCOUNT_OAUTH_FLOW_TTL_MS,
  ACCOUNT_RECOVERY_FLOW_PURPOSE,
  ACCOUNT_RECOVERY_SESSION_STORAGE_KEY,
  ACCOUNT_RECOVERY_SESSION_TTL_MS,
  ACCOUNT_SESSION_STORAGE_KEY,
  ACCOUNT_SESSION_SYNC_STORAGE_KEY,
  accountProfileFromUser,
  accountStorageIdentityFromSession,
  activateStoredAccountWorkspace,
  appleOAuthUrl,
  accountAuthErrorMessage,
  clearAccountWorkspace,
  clearAccountOAuthFlow,
  clearAccountOAuthFlows,
  clearAccountRecoverySession,
  createAccountOAuthFlowId,
  createAccountWorkspace,
  createOAuthPkce,
  createOAuthPkceChallenge,
  loadStoredAccountSession,
  parseAccountSessionSync,
  publishAccountSessionSync,
  resendSignupConfirmation,
  saveAccountSession,
  deleteAccount,
  exchangeOAuthCode,
  ensureAccountWorkspace,
  googleOAuthUrl,
  LEGACY_STATE_CLAIM_PREFIX,
  loadAccountOAuthFlow,
  loadAccountRecoverySession,
  normalizeAccountEmail,
  requestPasswordReset,
  saveAccountOAuthFlow,
  saveAccountRecoverySession,
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

test("email accounts require a deliverable-looking normalized address", async () => {
  assert.equal(normalizeAccountEmail("  User+events@Example.COM  "), "user+events@example.com");
  for (const invalid of [
    "",
    "missing-at.example.com",
    "two@@example.com",
    ".user@example.com",
    "user..name@example.com",
    "user@example",
    "user@-example.com",
    "user@example-.com",
    "user@example.c"
  ]) {
    assert.equal(normalizeAccountEmail(invalid), "", invalid);
  }

  let requested = false;
  await assert.rejects(
    signUpWithPassword(
      config,
      {
        email: "not-an-email",
        password: "long-password",
        displayName: "Test Person",
        username: "test_person"
      },
      async () => {
        requested = true;
        return jsonResponse(200, {});
      }
    ),
    /invalid email address/
  );
  await assert.rejects(
    requestPasswordReset(config, "user@example", "https://app.example.com/"),
    /invalid email address/
  );
  assert.equal(requested, false);
});

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

  const switching = publishAccountSessionSync(
    { user: { id: "user-3" } },
    {
      reason: "switching",
      storage,
      now: () => 6789,
      randomId: () => "sync-3"
    }
  );
  assert.equal(switching.reason, "switching");
  assert.equal(switching.userId, "user-3");
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

test("workspace repair for an authenticated account never reuses another user's active space", async () => {
  const storage = memoryStorage();
  storage.setItem(CLIENT_SPACE_STORAGE_KEY, "space-previous-account");
  storage.setItem(
    `${CLIENT_SPACE_KEY_STORAGE_PREFIX}space-previous-account`,
    "abcdefghijklmnopqrstuvwxyzABCDEF"
  );
  let updateBody = null;
  let ensureBody = null;
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    user: { id: "new-user", user_metadata: {} }
  };

  const repaired = await ensureAccountWorkspace(config, session, {
    storage,
    fetchImpl: async (url, request) => {
      if (String(url).endsWith("/auth/v1/user")) {
        updateBody = JSON.parse(request.body);
        return new Response(JSON.stringify({
          ...session.user,
          user_metadata: updateBody.data
        }), { status: 200 });
      }
      assert.match(String(url), /\/rest\/v1\/rpc\/ensure_account_workspace$/);
      ensureBody = JSON.parse(request.body);
      return jsonResponse(200, {
        status: "created",
        workspaceId: ensureBody.p_space_id
      });
    }
  });

  assert.notEqual(repaired.user.user_metadata.account_space_id, "space-previous-account");
  assert.equal(
    storage.getItem(CLIENT_SPACE_STORAGE_KEY),
    repaired.user.user_metadata.account_space_id
  );
  assert.deepEqual(ensureBody, {
    p_space_id: repaired.user.user_metadata.account_space_id
  });
});

test("every completed sign-in verifies an existing metadata workspace on the server", async () => {
  const storage = memoryStorage();
  const workspace = {
    id: "space-existing-account",
    key: "abcdefghijklmnopqrstuvwxyzABCDEF"
  };
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    user: {
      id: "existing-user",
      user_metadata: {
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  };
  const requests = [];

  const result = await ensureAccountWorkspace(config, session, {
    storage,
    fetchImpl: async (url, request) => {
      requests.push({ url: String(url), request });
      return jsonResponse(200, {
        status: "existing",
        workspaceId: workspace.id
      });
    }
  });

  assert.equal(result, session);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/rest\/v1\/rpc\/ensure_account_workspace$/);
  assert.equal(requests[0].request.method, "POST");
  assert.equal(requests[0].request.headers.authorization, "Bearer access-token");
  assert.deepEqual(JSON.parse(requests[0].request.body), {
    p_space_id: workspace.id
  });
  assert.equal(storage.getItem(CLIENT_SPACE_STORAGE_KEY), workspace.id);
});

test("sign-in fails visibly when the account workspace cannot be validated", async () => {
  const session = {
    access_token: "access-token",
    user: {
      id: "existing-user",
      user_metadata: {
        account_space_id: "space-existing-account",
        account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
      }
    }
  };

  await assert.rejects(
    ensureAccountWorkspace(config, session, {
      storage: memoryStorage(),
      fetchImpl: async () => jsonResponse(403, {
        message: "Account workspace ownership is invalid"
      })
    }),
    /Account workspace ownership is invalid/
  );
});

test("account cleanup removes abandoned OAuth flows without touching other data", () => {
  const storage = memoryStorage();
  storage.setItem(`${ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX}flow-one`, "one");
  storage.setItem(`${ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX}flow-two`, "two");
  storage.setItem("keep-me", "safe");

  assert.equal(clearAccountOAuthFlows(storage), 2);
  assert.equal(storage.getItem(`${ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX}flow-one`), null);
  assert.equal(storage.getItem(`${ACCOUNT_OAUTH_FLOW_STORAGE_PREFIX}flow-two`), null);
  assert.equal(storage.getItem("keep-me"), "safe");
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

test("password recovery flow is bound to the locally requested email", async () => {
  const storage = memoryStorage();
  const pkce = await createOAuthPkce();
  const id = createAccountOAuthFlowId();

  const saved = saveAccountOAuthFlow({
    id,
    verifier: pkce.verifier,
    returnPath: "/events",
    purpose: ACCOUNT_RECOVERY_FLOW_PURPOSE,
    email: "USER@example.com",
    createdAt: 1_000
  }, storage);

  assert.equal(saved.purpose, ACCOUNT_RECOVERY_FLOW_PURPOSE);
  assert.equal(saved.email, "user@example.com");
  assert.equal(
    loadAccountOAuthFlow(id, storage, 1_001)?.email,
    "user@example.com"
  );
  assert.equal(saveAccountOAuthFlow({
    id: createAccountOAuthFlowId(),
    verifier: pkce.verifier,
    returnPath: "/events",
    purpose: ACCOUNT_RECOVERY_FLOW_PURPOSE,
    email: "not-an-email",
    createdAt: 1_000
  }, storage), null);
});

test("password recovery remains active across reload only for the same account and TTL", () => {
  const storage = memoryStorage();
  const session = { user: { id: "account-user-1" } };

  assert.equal(saveAccountRecoverySession(session, storage, 1_000), true);
  assert.equal(
    storage.getItem(ACCOUNT_RECOVERY_SESSION_STORAGE_KEY) !== null,
    true
  );
  assert.equal(loadAccountRecoverySession(session, storage, 1_001), true);
  assert.equal(
    loadAccountRecoverySession(
      session,
      storage,
      1_000 + ACCOUNT_RECOVERY_SESSION_TTL_MS + 1
    ),
    false
  );
  assert.equal(storage.getItem(ACCOUNT_RECOVERY_SESSION_STORAGE_KEY), null);

  saveAccountRecoverySession(session, storage, 2_000);
  assert.equal(
    loadAccountRecoverySession({ user: { id: "account-user-2" } }, storage, 2_001),
    false
  );
  saveAccountRecoverySession(session, storage, 3_000);
  assert.equal(clearAccountRecoverySession(storage), true);
  assert.equal(loadAccountRecoverySession(session, storage, 3_001), false);
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
    { ...config, apiBaseUrl: "https://sogrim-hesbon-app.vercel.app" },
    { access_token: "access" },
    async (url) => {
      requestUrl = url;
      return jsonResponse(200, { ok: true, accountDeleted: true });
    }
  );

  assert.equal(requestUrl, "https://sogrim-hesbon-app.vercel.app/api/account");
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
      username: "yarin_test",
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
  assert.equal(body.data.username, "yarin_test");
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
      username: "first_account",
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
      username: "second_account",
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
  assert.equal(
    accountAuthErrorMessage(new Error("Email address not authorized"), "signup"),
    "ההרשמה באימייל עדיין אינה זמינה לכתובת הזו. אפשר להתחבר עם Google."
  );
  const googleConfigurationError = new Error("invalid audience");
  googleConfigurationError.status = 400;
  assert.equal(
    accountAuthErrorMessage(googleConfigurationError, "google"),
    "הכניסה עם Google לא הושלמה. כדאי לעדכן את האפליקציה, לבחור את החשבון שוב ולנסות."
  );
  assert.equal(
    accountAuthErrorMessage(new Error("Failed to fetch"), "google"),
    "לא הצלחנו להגיע לשירות החשבון. כדאי לבדוק את החיבור ולנסות שוב."
  );
});

test("signup confirmation can be resent without revealing whether the email exists", async () => {
  let request = null;
  const result = await resendSignupConfirmation(
    config,
    "  USER@example.com ",
    "https://app.example.com/auth/callback",
    async (url, options) => {
      request = { url, options };
      return jsonResponse(200, {});
    }
  );

  assert.equal(result, true);
  assert.match(request.url, /\/auth\/v1\/resend\?redirect_to=/);
  assert.deepEqual(JSON.parse(request.options.body), {
    type: "signup",
    email: "user@example.com"
  });
});

function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
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
