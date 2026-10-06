import { expect, test } from "@playwright/test";

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

async function prepare(page, { googleError = "", userFailureOnce = false, pkceError = false } = {}) {
  const counts = { token: 0, pkce: 0, user: 0, writes: 0, recovery: 0 };
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
  await page.addInitScript(({ config }) => {
    if (!sessionStorage.getItem("native-roundtrip-ready")) {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem("native-roundtrip-ready", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    globalThis.SogrimNativeRuntimeConfig = Object.freeze(config);
    globalThis.__roundtripListeners = {};
    globalThis.__roundtripOpened = [];
    globalThis.__roundtripSocialLogin = {
      initialize: async options => { globalThis.__roundtripGoogleConfig = options; },
      login: async options => {
        globalThis.__roundtripGoogleOptions = options;
        const count = Number(localStorage.getItem("roundtrip-chooser-count") || 0);
        localStorage.setItem("roundtrip-chooser-count", String(count + 1));
        return { result: { idToken: "fixture-google-id", accessToken: { token: "fixture-google-access" } } };
      }
    };
    globalThis.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => "ios",
      Plugins: {
        Browser: {
          open: async ({ url }) => globalThis.__roundtripOpened.push(url),
          close: async () => localStorage.setItem("roundtrip-browser-closed", "1")
        },
        App: {
          addListener: async (name, listener) => {
            globalThis.__roundtripListeners[name] = listener;
            return { remove() {} };
          },
          getLaunchUrl: async () => null
        }
      }
    };
  }, { config });
  await page.route(`${AUTH}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (url.pathname.endsWith("/auth/v1/settings")) return route.fulfill({ json: { external: { google: true, apple: true, email: true } } });
    if (url.pathname.endsWith("/auth/v1/token")) {
      const body = request.postDataJSON();
      if (url.searchParams.get("grant_type") === "pkce") {
        counts.pkce += 1;
        expect(body.auth_code).toBe("fixture-apple-code");
        expect(body.code_verifier).toBe(expectedVerifier);
        if (pkceError) return route.fulfill({ status: 400, json: { message: "Authorization code expired" } });
      } else {
        expect(url.searchParams.get("grant_type")).toBe("id_token");
        counts.token += 1;
        expect(body).toEqual({ provider: "google", id_token: "fixture-google-id", access_token: "fixture-google-access" });
        if (googleError && counts.token === 1) return route.fulfill({ status: 400, json: { message: googleError } });
      }
      return route.fulfill({ json: { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, user } });
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
    counts,
    getRecoveryRedirect: () => recoveryRedirect,
    async appleCallback() {
      await page.getByRole("button", { name: "המשך עם Apple", exact: true }).click();
      await expect.poll(() => page.evaluate(() => globalThis.__roundtripOpened.length)).toBe(1);
      const authorization = new URL(await page.evaluate(() => globalThis.__roundtripOpened[0]));
      expect(authorization.searchParams.get("provider")).toBe("apple");
      const callback = new URL(authorization.searchParams.get("redirect_to"));
      expect(`${callback.origin}${callback.pathname}`).toBe(CALLBACK);
      const id = callback.searchParams.get("auth_flow");
      expectedVerifier = await page.evaluate(id => JSON.parse(localStorage.getItem(`settle-friends-account-oauth-flow:${id}`)).verifier, id);
      callback.searchParams.set("code", "fixture-apple-code");
      await page.evaluate(url => globalThis.__roundtripListeners.appUrlOpen({ url }), callback.href);
      return id;
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
});

for (const googleError of ["JWT expired", "Invalid audience"]) {
  test(`native Google rejection is visible and a new attempt can succeed: ${googleError}`, async ({ page }) => {
    const { counts } = await prepare(page, { googleError });
    await page.getByRole("button", { name: "המשך עם Google", exact: true }).click();
    await expect(page.locator("#account-auth-feedback")).toHaveRole("alert");
    await expect(page.locator("#account-auth-feedback")).toContainText("Google");
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
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
});

test("failed Apple callback clears the spent code and remains ready for a new login", async ({ page }) => {
  const fixture = await prepare(page, { pkceError: true });
  const id = await fixture.appleCallback();
  await expect(page.locator("#account-auth-feedback")).toBeVisible();
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
  expect(counts.pkce).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("settle-friends-account-session"))).toBeNull();
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
