import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://iphone-session-history.supabase.co";
const USER_ID = "iphone-returning-user";
const PARTICIPANT_ID = `account-${USER_ID}`;
const SPACE_ID = "space-iphone-returning-user";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_123456";
const EVENT_NAME = "היסטוריה שנשמרה בענן";

const accountUser = {
  id: USER_ID,
  email: "iphone@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "משתמש אייפון",
    username: "iphone_user",
    account_space_id: SPACE_ID,
    account_space_key: SPACE_KEY
  }
};

const cloudState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [{
    id: PARTICIPANT_ID,
    displayName: "משתמש אייפון",
    kind: "user",
    accountLinked: true
  }],
  friendContacts: [],
  groups: [],
  events: [{
    id: "iphone-history-event",
    name: EVENT_NAME,
    currency: "ILS",
    participantIds: [PARTICIPANT_ID],
    adminIds: [PARTICIPANT_ID],
    createdByParticipantId: PARTICIPANT_ID,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:00:00.000Z",
    expenses: [],
    transfers: [],
    activityLog: []
  }],
  deletedEvents: [],
  deletedParticipants: []
};

test("an installed iPhone app keeps its session and restores cloud history", async ({ page }) => {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  let rejectedStaleToken = false;
  let refreshRequests = 0;

  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      publicUrl: "http://127.0.0.1:4182",
      storage: {
        mode: "supabase",
        url: AUTH_ORIGIN,
        anonKey: "anon-key",
        table: "app_snapshots"
      }
    }
  }));
  await page.route(`${AUTH_ORIGIN}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      refreshRequests += 1;
      return route.fulfill({
        headers: corsHeaders,
        json: {
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600,
          user: accountUser
        }
      });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      const authorization = request.headers().authorization ?? "";
      if (!rejectedStaleToken && authorization.includes("stale-access-token")) {
        rejectedStaleToken = true;
        return route.fulfill({
          status: 403,
          headers: corsHeaders,
          json: { message: "invalid JWT: token is malformed" }
        });
      }
      return route.fulfill({ headers: corsHeaders, json: accountUser });
    }
    if (url.pathname.endsWith("/rest/v1/rpc/ensure_account_workspace")) {
      return route.fulfill({
        headers: corsHeaders,
        json: { status: "existing", workspaceId: SPACE_ID }
      });
    }
    if (url.pathname.includes("/app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: [{ state: cloudState, updated_at: "2026-08-20T08:00:00.000Z" }]
      });
    }
    if (request.method() === "GET") {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  });

  await page.addInitScript(({ user }) => {
    if (!localStorage.getItem("iphone-session-history-seeded")) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("iphone-session-history-seeded", "1");
      localStorage.setItem("settle-friends-account-session", JSON.stringify({
        access_token: "stale-access-token",
        refresh_token: "persisted-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user
      }));
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { user: accountUser });

  await page.goto("/");
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  await expect(page.getByText(EVENT_NAME, { exact: true })).toBeVisible();
  expect(refreshRequests).toBe(1);

  await expect.poll(() => page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("settle-friends-account-session") || "null"
    );
    return session?.access_token ?? "";
  })).toBe("fresh-access-token");

  await page.reload();
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  await expect(page.getByText(EVENT_NAME, { exact: true })).toBeVisible();
  expect(refreshRequests).toBe(1);
});

test("an expiring iPhone session paints cached events before a slow token refresh", async ({ page }) => {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };

  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      publicUrl: "http://127.0.0.1:4182",
      storage: {
        mode: "supabase",
        url: AUTH_ORIGIN,
        anonKey: "anon-key",
        table: "app_snapshots"
      }
    }
  }));
  await page.route(`${AUTH_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return route.fulfill({
        headers: corsHeaders,
        json: {
          access_token: "eventually-fresh-access-token",
          refresh_token: "eventually-fresh-refresh-token",
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
        json: [{ state: cloudState, updated_at: "2026-08-20T08:00:00.000Z" }]
      });
    }
    if (request.method() === "GET") {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  });

  await page.addInitScript(({ user, state, spaceId, spaceKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-account-session", JSON.stringify({
      access_token: "expiring-access-token",
      refresh_token: "persisted-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 30,
      user
    }));
    localStorage.setItem("settle-friends-cloud-space", spaceId);
    localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
    localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(state));
    localStorage.setItem(
      `settle-friends-local-profile:account:${encodeURIComponent(user.id)}`,
      JSON.stringify({
        participantId: `account-${user.id}`,
        displayName: user.user_metadata.full_name,
        avatarPreset: "avatar-1",
        authProvider: "google",
        authSubject: user.id,
        email: user.email
      })
    );
    localStorage.setItem(
      `settle-friends-current-participant:account:${encodeURIComponent(user.id)}`,
      `account-${user.id}`
    );
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, {
    user: accountUser,
    state: cloudState,
    spaceId: SPACE_ID,
    spaceKey: SPACE_KEY
  });

  const startedAt = Date.now();
  await page.goto("/");
  await expect(page.getByText(EVENT_NAME, { exact: true }))
    .toBeVisible({ timeout: 3_000 });
  expect(Date.now() - startedAt).toBeLessThan(3_000);
  await expect(page.locator("#public-account-auth-gate")).toHaveCount(0);
  await expect(page.getByText("אין אירועים שלך עדיין", { exact: true }))
    .not.toBeVisible();
});
