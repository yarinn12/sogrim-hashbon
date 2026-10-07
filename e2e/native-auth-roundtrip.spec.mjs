import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test.use({ serviceWorkers: "block" });
const AUTH = "https://native-auth-roundtrip.supabase.co";
const CALLBACK = "https://sogrim-hesbon-app.vercel.app/auth/callback";
const user = {
  id: "native-roundtrip-user", email: "native-roundtrip@example.test",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "בדיקת התחברות", username: "native_roundtrip",
    account_space_id: "native-roundtrip-space", account_space_key: "abcdefghijklmnopqrstuvwxyz_123456"
  }
};
const participantId = `account-${user.id}`;
const eventName = "אירוע החשבון המחובר";
const state = {
  currentParticipantId: participantId,
  participants: [{ id: participantId, displayName: "בדיקת התחברות", kind: "user", accountLinked: true }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: "native-roundtrip-event", name: eventName, currency: "ILS",
    participantIds: [participantId], adminIds: [participantId], createdByParticipantId: participantId,
    createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z",
    expenses: [], transfers: [], activityLog: []
  }]
};

async function prepare(page, { googleError = "", userFailureOnce = false, pkceError = false, appleSession = false } = {}) {
  const counts = { token: 0, pkce: 0, refresh: 0, logout: 0, user: 0, writes: 0, recovery: 0 };
  const tokenBodies = [];
  let expectedVerifier = "";
  let recoveryRedirect = "";
  const config = {
    publicUrl: "https://sogrim-hesbon-app.vercel.app",
    auth: { googleClientId: "fixture-web.apps.googleusercontent.com", googleIosClientId: "fixture-ios.apps.googleusercontent.com" },
    launch: { googleAuthReady: true, googleIosAuthReady: true, authEmailDeliveryReady: true },
    storage: { mode: "supabase", url: AUTH, anonKey: "fixture-public-key", table: "app_snapshots" }
  };
  await page.route("**/api/config*", route => route.fulfill({ json: config }));
  // Replace only the external SDK boundary. The production click handler,
  // token exchange, callback bridge, persistence and account hydration run.
  await page.route("**/src/publicAccountAuthLayer.mjs*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const sdkImport = 'import("@capgo/capacitor-social-login")';
    expect(source.split(sdkImport)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(sdkImport, "Promise.resolve({ SocialLogin: globalThis.__roundtripSocialLogin })") });
  });
  await page.addInitScript(({ config, appleSession }) => {
    if (!sessionStorage.getItem("native-roundtrip-ready")) {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem("native-roundtrip-ready", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    globalThis.SogrimNativeRuntimeConfig = Object.freeze(config);
    globalThis.__roundtripListeners = {};
    globalThis.__roundtripOpened = [];
    globalThis.__roundtripSocialLogin = {
      initialize: async options => { localStorage.setItem("roundtrip-google-config", JSON.stringify(options)); },
      login: async options => {
        localStorage.setItem("roundtrip-google-options", JSON.stringify(options));
        const count = Number(localStorage.getItem("roundtrip-chooser-count") || 0);
        localStorage.setItem("roundtrip-chooser-count", String(count + 1));
        // Real AppAuth always requests a nonce, even when none was supplied.
        // Google echoes it; Supabase verifies SHA-256(raw nonce) against it.
        const claims = { nonce: options.options.nonce || "fixture-appauth-generated-nonce" };
        const token = `fixture.${btoa(JSON.stringify(claims)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}.synthetic`;
        return { result: { idToken: token, accessToken: { token: "fixture-google-access" } } };
      }
    };
    globalThis.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => "ios",
      Plugins: {
        ...(appleSession ? { SogrimAuthSession: { open: async ({ url }) => {
          const authorization = new URL(url);
          const callback = new URL(authorization.searchParams.get("redirect_to"));
          const flow = JSON.parse(localStorage.getItem(`settle-friends-account-oauth-flow:${callback.searchParams.get("auth_flow")}`));
          localStorage.setItem("roundtrip-session-verifier", flow.verifier);
          localStorage.setItem("roundtrip-apple-session-count", String(Number(localStorage.getItem("roundtrip-apple-session-count") || 0) + 1));
          callback.searchParams.set("code", "fixture-apple-code");
          return { url: callback.href };
        } } } : {}),
        Browser: {
          open: async ({ url }) => globalThis.__roundtripOpened.push(url),
          close: async () => {
            localStorage.setItem("roundtrip-browser-closed", "1");
            localStorage.setItem("roundtrip-browser-close-count", String(Number(localStorage.getItem("roundtrip-browser-close-count") || 0) + 1));
          }
        },
        App: {
          addListener: async (name, listener) => {
            globalThis.__roundtripListeners[name] = value => {
              if (name === "appUrlOpen") localStorage.setItem("roundtrip-retained-launch-url", value.url);
              return listener(value);
            };
            return { remove() {} };
          },
          // Actual Capacitor iOS returns the last universal link again after
          // every WebView reload. Preserve it instead of masking it with null.
          getLaunchUrl: async () => {
            const url = localStorage.getItem("roundtrip-retained-launch-url");
            if (url) localStorage.setItem("roundtrip-retained-launch-reads", String(Number(localStorage.getItem("roundtrip-retained-launch-reads") || 0) + 1));
            return url ? { url } : null;
          }
        }
      }
    };
  }, { config, appleSession });
  await page.route(`${AUTH}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (url.pathname.endsWith("/auth/v1/settings")) return route.fulfill({ json: { external: { google: true, apple: true, email: true } } });
    if (url.pathname.endsWith("/auth/v1/token")) {
      const body = request.postDataJSON();
      if (url.searchParams.get("grant_type") === "refresh_token") {
        counts.refresh += 1;
        expect(body.refresh_token).toBe("fixture-refresh");
        return route.fulfill({ json: { access_token: "fixture-refreshed-access", refresh_token: "fixture-refresh", expires_in: 3600, user } });
      } else if (url.searchParams.get("grant_type") === "pkce") {
        counts.pkce += 1;
        expect(body.auth_code).toBe("fixture-apple-code");
        const verifier = appleSession ? await page.evaluate(() => localStorage.getItem("roundtrip-session-verifier")) : expectedVerifier;
        expect(body.code_verifier).toBe(verifier);
        if (pkceError) return route.fulfill({ status: 400, json: { message: "Authorization code expired" } });
      } else {
        expect(url.searchParams.get("grant_type")).toBe("id_token");
        counts.token += 1;
        tokenBodies.push(body);
        const nonce = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString()).nonce;
        if (!body.nonce) return route.fulfill({ status: 400, json: { message: "Passed nonce and nonce in id_token should either both exist or not." } });
        if (createHash("sha256").update(body.nonce).digest("hex") !== nonce) return route.fulfill({ status: 400, json: { message: "Nonces mismatch" } });
        expect(body).toEqual({ provider: "google", id_token: expect.stringMatching(/^fixture\..+\.synthetic$/), access_token: "fixture-google-access", nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
        if (googleError && counts.token === 1) return route.fulfill({ status: 400, json: { message: googleError } });
      }
      return route.fulfill({ json: { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, user } });
    }
    if (url.pathname.endsWith("/auth/v1/logout")) {
      counts.logout += 1;
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/recover")) {
      counts.recovery += 1;
      expect(request.postDataJSON()).toEqual({ email: user.email });
      recoveryRedirect = url.searchParams.get("redirect_to");
      return route.fulfill({ json: {} });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      counts.user += 1;
      if (userFailureOnce && counts.user === 1) return route.fulfill({ status: 503, json: { message: "Temporary account outage" } });
      return route.fulfill({ json: user });
    }
    if (url.pathname.endsWith("/rpc/ensure_account_workspace")) return route.fulfill({ json: { status: "existing", workspaceId: user.user_metadata.account_space_id } });
    if (url.pathname.endsWith("/app_snapshots")) {
      if (request.method() !== "GET") {
        counts.writes += 1;
        const body = request.postDataJSON();
        const row = Array.isArray(body) ? body[0] : body;
        expect(row.state.currentParticipantId).toBe(participantId);
        expect(row.state.events.some(event => event.id === "native-roundtrip-event")).toBe(true);
      }
      return route.fulfill({ json: [{ state, updated_at: "2026-10-01T08:00:01.000Z" }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "המשך עם Apple", exact: true })).toBeVisible();
  return {
    counts, tokenBodies,
    getRecoveryRedirect: () => recoveryRedirect,
    async providerCallback(provider, { providerRejected = false, alreadyOpened = false } = {}) {
      if (!alreadyOpened) await page.getByRole("button", { name: provider === "google" ? "המשך עם Google" : "המשך עם Apple", exact: true }).click();
      await expect.poll(() => page.evaluate(() => globalThis.__roundtripOpened.length)).toBe(1);
      const authorization = new URL(await page.evaluate(() => globalThis.__roundtripOpened[0]));
      expect(authorization.searchParams.get("provider")).toBe(provider);
      expect(authorization.searchParams.get("code_challenge_method")).toBe("s256");
      expect(authorization.searchParams.get("code_challenge")).toBeTruthy();
      const callback = new URL(authorization.searchParams.get("redirect_to"));
      expect(`${callback.origin}${callback.pathname}`).toBe(CALLBACK);
      const id = callback.searchParams.get("auth_flow");
      expectedVerifier = await page.evaluate(id => JSON.parse(localStorage.getItem(`settle-friends-account-oauth-flow:${id}`)).verifier, id);
      callback.searchParams.set(providerRejected ? "error" : "code", providerRejected ? "access_denied" : "fixture-apple-code");
      await page.evaluate(url => globalThis.__roundtripListeners.appUrlOpen({ url }), callback.href);
      return id;
    },
    async appleCallback(options) {
      return this.providerCallback("apple", options);
    }
  };
}

async function expectAccount(page) {
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(eventName, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-account-session"))?.user?.id)).toBe(user.id);
  await page.reload();
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  await expect(page.getByText(eventName, { exact: true })).toBeVisible();
}

test("native Google returns to the account and retains the session after relaunch", async ({ page }) => {
  const { counts } = await prepare(page);
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expectAccount(page);
  expect(counts.token).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-chooser-count"))).toBe("1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("roundtrip-google-config")))).toEqual({
    google: { webClientId: "fixture-web.apps.googleusercontent.com", mode: "online", iOSClientId: "fixture-ios.apps.googleusercontent.com", iOSServerClientId: "fixture-web.apps.googleusercontent.com" }
  });
  const options = await page.evaluate(() => JSON.parse(localStorage.getItem("roundtrip-google-options")));
  expect(options).toEqual({ provider: "google", options: { scopes: ["openid", "email", "profile"], forcePrompt: true, nonce: expect.stringMatching(/^[a-f0-9]{64}$/) } });
});

for (const googleError of ["JWT expired", "Invalid audience"]) {
  test(`native Google rejection is visible and a new attempt can succeed: ${googleError}`, async ({ page }) => {
    const { counts } = await prepare(page, { googleError });
    await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
    await expect(page.locator("#account-auth-feedback")).toHaveRole("alert");
    await expect(page.locator("#account-auth-feedback")).toContainText("Google");
    await expect(page.locator("#account-auth-feedback")).toBeInViewport();
    await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
    await expectAccount(page);
    expect(counts.token).toBe(2);
  });
}

test("Apple callback closes the native browser, exchanges the bound code and opens the account", async ({ page }) => {
  const fixture = await prepare(page);
  const id = await fixture.appleCallback();
  await expectAccount(page);
  expect(fixture.counts.pkce).toBe(1);
  expect(fixture.counts.writes).toBeGreaterThan(0);
  expect(await page.evaluate(id => localStorage.getItem(`settle-friends-account-oauth-flow:${id}`), id)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-browser-closed"))).toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-browser-close-count"))).toBe("1");
  expect(Number(await page.evaluate(() => localStorage.getItem("roundtrip-retained-launch-reads")))).toBeGreaterThanOrEqual(2);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
});

test("Apple OS session delivers a valid code, writes the account and persists login without reopening Safari", async ({ page }) => {
  const fixture = await prepare(page, { appleSession: true });
  await page.getByRole("button", { name: "המשך עם Apple", exact: true }).click();
  await expectAccount(page);
  expect(fixture.counts.pkce).toBe(1);
  expect(fixture.counts.writes).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-apple-session-count"))).toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-browser-close-count"))).toBeNull();
  expect(await page.evaluate(() => globalThis.__roundtripOpened.length)).toBe(0);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
});

test("the login and email gates retain the current app mark after rerender", async ({ page }) => {
  await prepare(page);
  const mark = page.locator("#public-account-auth-gate .account-auth-mark img");
  await expect(mark).toHaveAttribute("src", "./app-icon-exterior-192.png");
  await expect.poll(() => mark.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('[data-account-mode="signup"]').click();
  await expect(page.locator('[data-account-form][data-mode="signup"]')).toBeVisible();
  await expect(mark).toHaveAttribute("src", "./app-icon-exterior-192.png");
  await page.reload();
  await expect(mark).toHaveAttribute("src", "./app-icon-exterior-192.png");
});

test("rejected Google identity stays in the app and a fresh native retry persists the verified account", async ({ page }) => {
  const fixture = await prepare(page, { googleError: "Unacceptable audience in id_token" });
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expect(page.locator("#account-auth-feedback")).toContainText("Google");
  await expect(page.locator("#account-auth-feedback")).toBeInViewport();
  expect(await page.evaluate(() => globalThis.__roundtripOpened.length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("settle-friends-account-session"))).toBeNull();
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expectAccount(page);
  expect(fixture.counts.token).toBe(2);
  expect(fixture.counts.pkce).toBe(0);
  expect(fixture.counts.writes).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-chooser-count"))).toBe("2");
  expect(fixture.tokenBodies[1].nonce).not.toBe(fixture.tokenBodies[0].nonce);
  await page.reload();
  await expectAccount(page);
  expect(fixture.counts.token).toBe(2);
});

test("a rejected native Google identity remains signed out after reload without repeated token exchanges", async ({ page }) => {
  const fixture = await prepare(page, { googleError: "Unacceptable audience in id_token", pkceError: true });
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expect(page.locator("#account-auth-feedback")).toContainText("Google");
  await expect(page.locator("#account-auth-feedback")).toBeInViewport();
  await expect(page.getByRole("button", { name: "המשך עם Google", exact: true })).toBeEnabled();
  expect(fixture.counts.token).toBe(1);
  expect(fixture.counts.pkce).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("settle-friends-account-session"))).toBeNull();
  expect(await page.evaluate(() => globalThis.__roundtripOpened.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "המשך עם Google", exact: true })).toBeEnabled();
  expect(fixture.counts.pkce).toBe(0);
  expect(fixture.counts.token).toBe(1);
});

test("failed Apple callback clears the spent code and remains ready for a new login", async ({ page }) => {
  const fixture = await prepare(page, { pkceError: true });
  const id = await fixture.appleCallback();
  await expect(page.locator("#account-auth-feedback")).toBeVisible();
  await expect(page.locator("#account-auth-feedback")).toContainText("ההתחברות לא הושלמה");
  await expect(page.getByRole("button", { name: "המשך עם Apple", exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
  expect(await page.evaluate(id => localStorage.getItem(`settle-friends-account-oauth-flow:${id}`), id)).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "המשך עם Apple", exact: true })).toBeVisible();
  expect(fixture.counts.pkce).toBe(1);
});

test("an unbound Apple callback cannot exchange a code or replace the account", async ({ page }) => {
  const { counts } = await prepare(page);
  await page.evaluate(url => globalThis.__roundtripListeners.appUrlOpen({ url }), `${CALLBACK}?code=attacker-code&auth_flow=unbound-flow`);
  await expect(page.locator("#account-auth-feedback")).toBeVisible();
  await expect(page.locator("#account-auth-feedback")).toContainText("ההתחברות לא הושלמה");
  expect(counts.pkce).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("settle-friends-account-session"))).toBeNull();
});

test("Apple provider rejection explains the failure and restores a fresh attempt", async ({ page }) => {
  const fixture = await prepare(page);
  const id = await fixture.appleCallback({ providerRejected: true });
  await expect(page.locator("#account-auth-feedback")).toContainText("ההתחברות לא הושלמה");
  await expect(page.getByRole("button", { name: "המשך עם Apple", exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.has("error")).toBe(false);
  expect(await page.evaluate(id => localStorage.getItem(`settle-friends-account-oauth-flow:${id}`), id)).toBeNull();
  expect(fixture.counts.pkce).toBe(0);
});

test("accepted Google login recovers after a temporary account lookup failure without another chooser", async ({ page }) => {
  const { counts } = await prepare(page, { userFailureOnce: true });
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expect(page.getByRole("heading", { name: "נכנסת בהצלחה", exact: true })).toBeVisible();
  await expectAccount(page);
  expect(counts.token).toBe(1);
  expect(counts.user).toBeGreaterThan(1);
  expect(await page.evaluate(() => localStorage.getItem("roundtrip-chooser-count"))).toBe("1");
});

test("an expired saved access token refreshes without asking Google to sign in again", async ({ page }) => {
  const { counts } = await prepare(page);
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expectAccount(page);
  await page.evaluate(() => {
    const key = "settle-friends-account-session";
    const session = JSON.parse(localStorage.getItem(key));
    session.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.reload();
  await expect(page.getByText(eventName, { exact: true })).toBeVisible();
  await expect.poll(() => counts.refresh).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-account-session"))?.access_token)).toBe("fixture-refreshed-access");
  expect(counts.token).toBe(1);
});

test("sign-out removes the saved session and returns to usable native login options", async ({ page }) => {
  const { counts } = await prepare(page);
  await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
  await expectAccount(page);
  await page.locator('[data-nav-destination="profile"]').click();
  await expect(page.locator('[data-account-controls]')).toBeVisible();
  await page.locator('[data-account-controls] summary').click();
  await page.getByRole("button", { name: "התנתק", exact: true }).click();
  await expect(page.getByRole("button", { name: "המשך עם Apple", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "המשך עם Google", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("settle-friends-account-session"))).toBeNull();
  expect(counts.logout).toBe(1);
  await expect(page.getByText(eventName, { exact: true })).toBeHidden();
});

test("password recovery from email returns through the native callback and survives reload", async ({ page }) => {
  const fixture = await prepare(page);
  await page.locator('input[name="email"]').fill(user.email);
  await page.getByRole("button", { name: "שכחתי סיסמה", exact: true }).click();
  await expect(page.locator("#account-auth-feedback")).toContainText("שלחנו קישור");
  const callback = new URL(fixture.getRecoveryRedirect());
  callback.hash = new URLSearchParams({ type: "recovery", access_token: "fixture-recovery-access", refresh_token: "fixture-recovery-refresh", expires_in: "3600" }).toString();
  await page.evaluate(url => globalThis.__roundtripListeners.appUrlOpen({ url }), callback.href);
  await expect(page.getByRole("heading", { name: "איפוס סיסמה", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "איפוס סיסמה", exact: true })).toBeVisible();
  expect(fixture.counts.recovery).toBe(1);
});
