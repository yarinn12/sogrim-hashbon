import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const USER_ID = "profile-notifications-user";
const PARTICIPANT_ID = `account-${USER_ID}`;
const EVENT_ID = "profile-notifications-event";
const SPACE_ID = "space-profile-notifications";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_123456";

const seededState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [
    {
      id: PARTICIPANT_ID,
      displayName: "ירין יצחק",
      kind: "user",
      avatarPreset: "avatar-1",
      accountLinked: true
    }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "טיול לצפון עם החברים",
      currency: "ILS",
      participantIds: [PARTICIPANT_ID],
      adminIds: [PARTICIPANT_ID],
      createdByParticipantId: PARTICIPANT_ID,
      createdAt: "2026-08-18T06:00:00.000Z",
      updatedAt: "2026-08-18T06:00:00.000Z",
      expenses: [],
      transfers: [],
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page }) => {
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const inboxItems = [
    {
      id: "notification-expense",
      event_id: EVENT_ID,
      activity_id: "activity-expense",
      kind: "expense-created",
      title: "נוספה הוצאה חדשה",
      body: "מאור הוסיף ארוחת ערב במסעדה המרכזית בסך 248.50 ₪",
      view: "event",
      action_url: "",
      created_at: twoMinutesAgo,
      read_at: null
    },
    {
      id: "notification-participant",
      event_id: EVENT_ID,
      activity_id: "activity-participant",
      kind: "participant-joined",
      title: "אריאל הצטרף לאירוע",
      body: "אריאל ניזרי הצטרף לטיול לצפון עם החברים",
      view: "event",
      action_url: "",
      created_at: twoHoursAgo,
      read_at: new Date().toISOString()
    },
    {
      id: "notification-invite",
      event_id: EVENT_ID,
      activity_id: "activity-invite",
      kind: "event-invite",
      title: "הוזמנת לאירוע עם שם ארוך במיוחד כדי לבדוק תצוגה",
      body: "הראל הזמין אותך להשתתף באירוע סוף שבוע ארוך בצפון",
      view: "summary",
      action_url: "",
      created_at: yesterday.toISOString(),
      read_at: null
    }
  ];

  await page.route("**/api/config", (route) => route.fulfill({ json: {
      publicUrl: "http://127.0.0.1:4182",
      storage: {
        mode: "supabase",
        url: "https://profile-notifications.supabase.co",
        anonKey: "anon-key",
        table: "app_snapshots"
      }
    }}));
  await page.route("https://profile-notifications.supabase.co/**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      return route.fulfill({
        headers: corsHeaders,
        json: {
          id: USER_ID,
          email: "yarin@example.com",
          app_metadata: { provider: "google" },
          user_metadata: {
            full_name: "ירין יצחק",
            username: "yarin",
            account_space_id: SPACE_ID,
            account_space_key: SPACE_KEY
          }
        }
      });
    }
    if (url.pathname.includes("notification_inbox")) {
      if (route.request().method() === "GET") {
        return route.fulfill({ headers: corsHeaders, json: inboxItems });
      }
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    if (url.pathname.includes("app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: [{ state: seededState, updated_at: "2026-08-18T06:00:00.000Z" }]
      });
    }
    if (route.request().method() === "GET") {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  });

  await page.addInitScript(({ participantId, state, userId, spaceId, spaceKey }) => {
    if (localStorage.getItem("settle-friends-account-session")) {
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
      return;
    }
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId,
        displayName: "ירין יצחק",
        username: "yarin",
        avatarPreset: "avatar-1",
        authProvider: "google",
        authSubject: userId,
        email: "yarin@example.com"
      })
    );
    localStorage.setItem("settle-friends-current-participant", participantId);
    localStorage.setItem(
      "settle-friends-account-session",
      JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          email: "yarin@example.com",
          app_metadata: { provider: "google" },
          user_metadata: {
            full_name: "ירין יצחק",
            username: "yarin",
            account_space_id: spaceId,
            account_space_key: spaceKey
          }
        }
      })
    );
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, {
    participantId: PARTICIPANT_ID,
    state: seededState,
    userId: USER_ID,
    spaceId: SPACE_ID,
    spaceKey: SPACE_KEY
  });

  await page.goto("/");
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
});

test("profile keeps sensitive account actions behind one clear disclosure", async ({ page }) => {
  await page.locator('[data-nav-destination="profile"]').click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();

  const accountDetails = page.locator("[data-account-controls]");
  await expect(accountDetails).toBeVisible();
  await expect(accountDetails).not.toHaveAttribute("open", "");
  await expect(accountDetails.locator('[data-account-action="signout"]')).not.toBeVisible();
  if (process.env.CAPTURE_PROFILE_NOTIFICATIONS === "1") {
    await page.screenshot({
      path: "design-audits/consistency-current/07c-profile-connected-compact.png",
      fullPage: true
    });
  }

  await accountDetails.locator(":scope > summary").click();
  await expect(accountDetails).toHaveAttribute("open", "");
  await expect(accountDetails.locator('[data-account-action="signout"]')).toBeVisible();
  await expect(accountDetails.locator('[data-account-action="delete-account-open"]')).toBeVisible();
  await expect(accountDetails.locator('a[href="./privacy.html"]')).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("a gallery profile image persists after reload without a false sync warning", async ({ page }) => {
  await page.locator('[data-nav-destination="profile"]').click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  const picker = page.locator(".profile-avatar-picker-shell");
  await picker.locator(":scope > summary").click();
  await picker
    .locator('[data-action="profile-avatar-image"][data-image-source="gallery"]')
    .setInputFiles("icon-192.png");
  await expect(page.locator(".notice")).toHaveText("תמונת הפרופיל נשמרה.");
  const uploadedSource = await page
    .locator(".product-header-profile-avatar img")
    .getAttribute("src");
  expect(uploadedSource).toMatch(/^data:image\/jpeg;base64,/);

  await page.reload();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await expect(page.locator(".product-header-profile-avatar img"))
    .toHaveAttribute("src", uploadedSource);
});

test("notification inbox stays readable and completes its main mobile actions", async ({ page }) => {
  await expect(page.locator(".product-nav-badge")).toHaveText("2");
  await page.locator('[data-nav-destination="notifications"]').click();
  await expect(page.locator('[data-screen-kind="notifications"]')).toBeVisible();
  await expect(page.locator(".notification-inbox-item")).toHaveCount(3);

  const primaryNavigation = page.locator(".product-app-nav");
  await expect(primaryNavigation.locator(".product-nav-button:visible")).toHaveCount(4);
  await expect(
    primaryNavigation.locator('[data-nav-destination="notifications"]')
  ).toHaveAttribute("aria-current", "page");
  await expect(primaryNavigation.locator(".product-nav-badge")).toHaveText("2");
  await expect(page.locator(".notification-inbox-item time").last()).toHaveText("אתמול");
  await assertNoHorizontalOverflow(page);
  if (process.env.CAPTURE_PROFILE_NOTIFICATIONS === "1") {
    await page.screenshot({
      path: "design-audits/consistency-current/09c-notifications-list.png",
      fullPage: true
    });
  }

  await page.locator('[data-action="mark-all-notifications-read"]').click();
  await expect(page.locator(".notification-inbox-item.is-read")).toHaveCount(3);
  await expect(primaryNavigation.locator(".product-nav-badge")).toBeHidden();

  await page.locator(".notification-inbox-item").first().click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT_ID}"]`))
    .toBeVisible();
  await page.locator('[data-action="go-back"]').click();
  await expect(page.locator('[data-screen-kind="notifications"]')).toBeVisible();
});

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
