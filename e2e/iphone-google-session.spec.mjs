import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://iphone-google-session.supabase.co";
const USER_ID = "iphone-google-user";
const PARTICIPANT_ID = `account-${USER_ID}`;
const SPACE_ID = "space-iphone-google-user";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_654321";

const accountUser = {
  id: USER_ID,
  email: "iphone-google@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "משתמש גוגל",
    username: "iphone_google",
    account_space_id: SPACE_ID,
    account_space_key: SPACE_KEY
  }
};

const cloudState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [{
    id: PARTICIPANT_ID,
    displayName: "משתמש גוגל",
    kind: "user",
    accountLinked: true,
    authProvider: "google",
    authSubject: USER_ID,
    email: accountUser.email
  }],
  friendContacts: [],
  groups: [],
  events: [],
  deletedEvents: [],
  deletedParticipants: []
};

test("iPhone Google sign-in keeps the session after returning to the app", async ({ page }) => {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  let idTokenRequests = 0;

  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      publicUrl: "http://127.0.0.1:4182",
      auth: { googleClientId: "google-client.apps.googleusercontent.com" },
      storage: {
        mode: "supabase",
        url: AUTH_ORIGIN,
        anonKey: "anon-key",
        table: "app_snapshots"
      }
    }
  }));
  await page.route("https://accounts.google.com/gsi/client*", (route) => route.fulfill({
    headers: { "access-control-allow-origin": "*" },
    contentType: "application/javascript",
    body: `
      window.google = { accounts: { id: {
        initialize(options) { window.__googleIdentityOptions = options; },
        renderButton(target) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "המשך עם Google";
          button.addEventListener("click", () => {
            window.__googleIdentityOptions.callback({ credential: "google-id-token" });
          });
          target.replaceChildren(button);
        },
        prompt() {
          window.__googleIdentityOptions.callback({ credential: "google-id-token" });
        }
      } } };
    `
  }));
  await page.route(`${AUTH_ORIGIN}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/settings")) {
      return route.fulfill({
        headers: corsHeaders,
        json: { external: { google: true, apple: false } }
      });
    }
    if (
      url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "id_token"
    ) {
      idTokenRequests += 1;
      return route.fulfill({
        headers: corsHeaders,
        json: {
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          expires_in: 3600,
          user: accountUser
        }
      });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      return route.fulfill({ headers: corsHeaders, json: accountUser });
    }
    if (url.pathname.includes("/app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: request.method() === "GET"
          ? [{ state: cloudState, updated_at: "2026-08-26T00:00:00.000Z" }]
          : []
      });
    }
    if (url.pathname.includes("/rest/v1/rpc/")) {
      return route.fulfill({ headers: corsHeaders, json: {} });
    }
    return route.fulfill({ headers: corsHeaders, json: [] });
  });

  await page.addInitScript(() => {
    if (!localStorage.getItem("iphone-google-test-ready")) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("iphone-google-test-ready", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  });

  await page.goto("/?pwa_release=360");
  const googleButton = page.getByRole("button", { name: "המשך עם Google" });
  await expect(googleButton).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => Boolean(window.__googleIdentityOptions))
  ).toBe(true);
  expect(await page.evaluate(() => ({
    itpSupport: window.__googleIdentityOptions?.itp_support,
    fedCmButton: window.__googleIdentityOptions?.use_fedcm_for_button,
    autoSelect: window.__googleIdentityOptions?.button_auto_select
  }))).toEqual({
    itpSupport: true,
    fedCmButton: true,
    autoSelect: false
  });

  await googleButton.click();
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  expect(idTokenRequests).toBe(1);
  expect(await page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("settle-friends-account-session") || "null"
    );
    return {
      accessToken: session?.access_token,
      refreshToken: session?.refresh_token,
      userId: session?.user?.id
    };
  })).toEqual({
    accessToken: "google-access-token",
    refreshToken: "google-refresh-token",
    userId: USER_ID
  });

  await page.reload();
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  expect(idTokenRequests).toBe(1);
});
