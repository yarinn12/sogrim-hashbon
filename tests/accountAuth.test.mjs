import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_SESSION_STORAGE_KEY,
  accountProfileFromUser,
  accountStorageIdentityFromSession,
  activateStoredAccountWorkspace,
  appleOAuthUrl,
  accountAuthErrorMessage,
  clearAccountWorkspace,
  loadStoredAccountSession,
  saveAccountSession,
  deleteAccount,
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
