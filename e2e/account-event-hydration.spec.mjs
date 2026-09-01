import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://account-hydration.supabase.co";
const USER_ID = "returning-account-hydration-user";
const PARTICIPANT_ID = `account-${USER_ID}`;
const SPACE_ID = "space-returning-account-hydration";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_123456";
const EVENT_NAME = "אירוע שחזר מהענן";

const accountUser = {
  id: USER_ID,
  email: "returning@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "משתמש חוזר",
    username: "returning_user",
    account_space_id: SPACE_ID,
    account_space_key: SPACE_KEY
  }
};

const cloudState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [{
    id: PARTICIPANT_ID,
    displayName: "משתמש חוזר",
    kind: "user",
    accountLinked: true
  }],
  friendContacts: [],
  groups: [],
  events: [{
    id: "returning-cloud-event",
    name: EVENT_NAME,
    currency: "ILS",
    participantIds: [PARTICIPANT_ID],
    adminIds: [PARTICIPANT_ID],
    createdByParticipantId: PARTICIPANT_ID,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    expenses: [],
    transfers: [],
    activityLog: []
  }],
  deletedEvents: [],
  deletedParticipants: []
};

const staleLocalState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [{
    id: PARTICIPANT_ID,
    displayName: "משתמש חוזר",
    kind: "user",
    accountLinked: true
  }],
  friendContacts: [],
  groups: [],
  events: [{
    id: "inactive-local-history",
    name: "אירוע ישן שאינו מוצג",
    participantIds: [PARTICIPANT_ID],
    inactiveParticipantIds: [PARTICIPANT_ID],
    adminIds: [],
    createdByParticipantId: "another-participant",
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    expenses: [],
    transfers: [],
    activityLog: []
  }],
  deletedEvents: [],
  deletedParticipants: []
};

test("a returning account never sees the new-user empty state while cloud history is delayed", async ({ page }) => {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  let snapshotReads = 0;

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
    if (url.pathname.endsWith("/auth/v1/user")) {
      return route.fulfill({ headers: corsHeaders, json: accountUser });
    }
    if (url.pathname.endsWith("/rest/v1/rpc/ensure_account_workspace")) {
      return route.fulfill({
        headers: corsHeaders,
        json: { status: "existing", workspaceId: SPACE_ID }
      });
    }
    if (url.pathname.includes("/app_snapshots") && request.method() === "GET") {
      snapshotReads += 1;
      if (snapshotReads === 1) {
        return route.fulfill({
          status: 503,
          headers: corsHeaders,
          json: { message: "temporary startup outage" }
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      return route.fulfill({
        headers: corsHeaders,
        json: url.searchParams.get("select") === "updated_at"
          ? [{ updated_at: "2026-09-01T08:00:00.000Z" }]
          : [{ state: cloudState, updated_at: "2026-09-01T08:00:00.000Z" }]
      });
    }
    if (url.pathname.includes("/app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: [{ updated_at: "2026-09-01T08:00:01.000Z" }]
      });
    }
    if (request.method() === "GET") {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  });

  await page.addInitScript(({ user, staleState, spaceId, spaceKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-account-session", JSON.stringify({
      access_token: "active-access-token",
      refresh_token: "active-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user
    }));
    // Reproduce a returning device whose authenticated profile survived but
    // whose account-scoped event cache is empty. This is the exact startup
    // shape that used to be mistaken for a genuinely new account.
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
    localStorage.setItem("settle-friends-cloud-space", spaceId);
    localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
    localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(staleState));
    localStorage.setItem(
      `settle-friends-current-participant:account:${encodeURIComponent(user.id)}`,
      `account-${user.id}`
    );
    globalThis.__sawFalseEmptyAccount = false;
    globalThis.__sawAccountHydrationGuard = false;
    const watchAccountHydration = () => {
      const observer = new MutationObserver(() => {
        const bodyText = document.body?.innerText ?? "";
        if (bodyText.includes("אין אירועים שלך עדיין")) {
          globalThis.__sawFalseEmptyAccount = true;
        }
        if (
          bodyText.includes("טוענים את האירועים שלך…") ||
          bodyText.includes("האירועים שלך עדיין שמורים")
        ) {
          globalThis.__sawAccountHydrationGuard = true;
        }
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true
      });
    };
    if (document.documentElement) watchAccountHydration();
    else document.addEventListener("DOMContentLoaded", watchAccountHydration, { once: true });
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, {
    user: accountUser,
    staleState: staleLocalState,
    spaceId: SPACE_ID,
    spaceKey: SPACE_KEY
  });

  await page.goto("/");
  await expect(page.getByText("אין אירועים שלך עדיין", { exact: true }))
    .toHaveCount(0);
  await expect(page.getByText(EVENT_NAME, { exact: true }))
    .toBeVisible({ timeout: 15_000 });
  expect(snapshotReads).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => globalThis.__sawAccountHydrationGuard))
    .toBe(true);
  await expect.poll(() => page.evaluate(() => globalThis.__sawFalseEmptyAccount))
    .toBe(false);
});
