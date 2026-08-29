import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const AUTH_ORIGIN = "https://iphone-reminder.supabase.co";
const MAOR_USER_ID = "87b6c358-fe9c-448f-84e6-6bb093273944";
const YARIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const MAOR_ID = `account-${MAOR_USER_ID}`;
const YARIN_ID = `account-${YARIN_USER_ID}`;
const EVENT_ID = "event-korea-iphone-reminder";

const accountUser = {
  id: MAOR_USER_ID,
  email: "maor@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "Awesome Maor",
    username: "theamazingmaor",
    account_space_id: "space-maor-iphone",
    account_space_key: "abcdefghijklmnopqrstuvwxyz_123456"
  }
};

const cloudState = {
  currentParticipantId: MAOR_ID,
  participants: [
    { id: MAOR_ID, displayName: "Awesome Maor", kind: "user", accountLinked: true },
    { id: YARIN_ID, displayName: "ירין יצחק", kind: "user", accountLinked: true }
  ],
  friendContacts: [],
  groups: [],
  events: [{
    id: EVENT_ID,
    name: "קוריאה",
    currency: "ILS",
    participantIds: [MAOR_ID, YARIN_ID],
    adminIds: [YARIN_ID],
    createdByParticipantId: YARIN_ID,
    createdAt: "2026-08-27T08:00:00.000Z",
    updatedAt: "2026-08-27T09:00:00.000Z",
    expenses: [{
      id: "expense-korea-reminder",
      name: "מלון",
      total: 20000,
      payers: [{ participantId: MAOR_ID, amount: 20000 }],
      sharedByParticipantIds: [MAOR_ID, YARIN_ID],
      createdByParticipantId: MAOR_ID,
      updatedAt: "2026-08-27T09:00:00.000Z"
    }],
    transfers: [{
      id: `transfer-${YARIN_ID}-${MAOR_ID}-10000`,
      fromParticipantId: YARIN_ID,
      toParticipantId: MAOR_ID,
      amount: 10000,
      status: "pending"
    }],
    activityLog: []
  }],
  deletedEvents: [],
  deletedParticipants: []
};

test("a recipient can send an in-app reminder even without system push capability", async ({ page }) => {
  let reminderRequests = 0;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };

  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      publicUrl: "http://127.0.0.1:4182",
      apiBaseUrl: "http://127.0.0.1:4182",
      storage: {
        mode: "supabase",
        url: AUTH_ORIGIN,
        anonKey: "anon-key",
        table: "app_snapshots"
      },
      launch: {
        cloudStorageReady: true,
        pushDeliveryReady: false,
        shareLinksReady: true
      }
    }
  }));
  await page.route("**/api/notifications/payment-reminder", async (route) => {
    reminderRequests += 1;
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        delivered: 0,
        inbox: true,
        reason: "in-app-only"
      }
    });
  });
  await page.route(`${AUTH_ORIGIN}/**`, (route) => {
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
        json: { status: "existing", workspaceId: "space-maor-iphone" }
      });
    }
    if (url.pathname.includes("/app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: [{ state: cloudState, updated_at: "2026-08-27T09:00:00.000Z" }]
      });
    }
    if (request.method() === "GET") {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  });

  await page.addInitScript(({ user }) => {
    if (!localStorage.getItem("iphone-reminder-seeded")) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("iphone-reminder-seeded", "1");
      localStorage.setItem("settle-friends-account-session", JSON.stringify({
        access_token: "maor-access-token",
        refresh_token: "maor-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user
      }));
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { user: accountUser });

  await page.goto("/");
  await expect(page.getByText("קוריאה", { exact: true })).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`).first().click();

  const reminder = page.locator('[data-action="send-payment-reminder"]');
  await expect(reminder).toBeVisible();
  await expect(reminder).toHaveAttribute("aria-label", /שלח תזכורת לירין יצחק/);
  await expect(reminder.locator("svg")).toHaveCount(1);
  await reminder.click();
  await expect(page.locator(".app-toast")).toContainText(
    "התזכורת מחכה לירין יצחק בתוך האפליקציה"
  );
  expect(reminderRequests).toBe(1);
});
