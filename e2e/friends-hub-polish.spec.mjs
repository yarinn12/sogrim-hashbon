import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const USER_ID = "11111111-1111-4111-8111-111111111111";
const MAOR_ID = "22222222-2222-4222-8222-222222222222";
const ARIEL_ID = "33333333-3333-4333-8333-333333333333";
const HAREL_ID = "44444444-4444-4444-8444-444444444444";
const PARTICIPANT_ID = `account-${USER_ID}`;
const MAOR_PARTICIPANT_ID = `account-${MAOR_ID}`;
const OFFLINE_NOA_ID = "offline-noa";
const OFFLINE_DANI_ID = "offline-dani";
const OFFLINE_MAOR_ID = "offline-maor";
const SPACE_ID = "space-friends-hub-polish";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_123456";

const profiles = [
  {
    user_id: USER_ID,
    username: "yarin",
    username_customized: true,
    display_name: "ירין יצחק",
    avatar_preset: "avatar-1",
    updated_at: "2026-08-18T06:00:00.000Z"
  },
  {
    user_id: MAOR_ID,
    username: "maor",
    username_customized: true,
    display_name: "מאור סיבוני",
    avatar_preset: "avatar-2",
    updated_at: "2026-08-18T06:00:00.000Z"
  },
  {
    user_id: ARIEL_ID,
    username: "ariel",
    username_customized: true,
    display_name: "אריאל ניזרי",
    avatar_preset: "avatar-3",
    updated_at: "2026-08-18T06:00:00.000Z"
  },
  {
    user_id: HAREL_ID,
    username: "harel",
    username_customized: true,
    display_name: "הראל כהן",
    avatar_preset: "avatar-4",
    updated_at: "2026-08-18T06:00:00.000Z"
  }
];

const friendships = [
  {
    id: "friendship-maor",
    requester_id: USER_ID,
    addressee_id: MAOR_ID,
    status: "accepted",
    requested_at: "2026-08-10T08:00:00.000Z",
    responded_at: "2026-08-10T09:00:00.000Z",
    updated_at: "2026-08-10T09:00:00.000Z"
  },
  {
    id: "friendship-ariel",
    requester_id: ARIEL_ID,
    addressee_id: USER_ID,
    status: "pending",
    requested_at: "2026-08-17T08:00:00.000Z",
    responded_at: null,
    updated_at: "2026-08-17T08:00:00.000Z"
  },
  {
    id: "friendship-harel",
    requester_id: USER_ID,
    addressee_id: HAREL_ID,
    status: "pending",
    requested_at: "2026-08-16T08:00:00.000Z",
    responded_at: null,
    updated_at: "2026-08-16T08:00:00.000Z"
  }
];

const seededState = {
  currentParticipantId: PARTICIPANT_ID,
  participants: [
    {
      id: PARTICIPANT_ID,
      displayName: "ירין יצחק",
      kind: "user",
      accountLinked: true,
      authSubject: USER_ID,
      avatarPreset: "avatar-1"
    },
    {
      id: MAOR_PARTICIPANT_ID,
      displayName: "מאור סיבוני",
      kind: "member",
      accountLinked: true,
      authSubject: MAOR_ID,
      avatarPreset: "avatar-2"
    },
    { id: OFFLINE_NOA_ID, displayName: "נועה כהן", kind: "guest" },
    { id: OFFLINE_DANI_ID, displayName: "דני לוי", kind: "guest" },
    { id: OFFLINE_MAOR_ID, displayName: "מאור סיבוני", kind: "guest" }
  ],
  friendContacts: [
    {
      id: OFFLINE_NOA_ID,
      participantId: OFFLINE_NOA_ID,
      active: true,
      source: "offline",
      updatedAt: "2026-08-12T08:00:00.000Z"
    },
    {
      id: OFFLINE_DANI_ID,
      participantId: OFFLINE_DANI_ID,
      active: true,
      source: "offline",
      updatedAt: "2026-08-12T08:00:00.000Z"
    },
    {
      id: OFFLINE_MAOR_ID,
      participantId: OFFLINE_MAOR_ID,
      active: true,
      source: "offline",
      updatedAt: "2026-08-12T08:00:00.000Z"
    }
  ],
  groups: [
    {
      id: "group-friends",
      name: "החברים הקבועים",
      memberIds: [PARTICIPANT_ID, OFFLINE_NOA_ID, OFFLINE_DANI_ID],
      adminIds: [PARTICIPANT_ID],
      createdAt: "2026-08-11T18:30:00.000Z",
      archived: false
    },
    {
      id: "group-work",
      name: "החבר׳ה מהעבודה",
      memberIds: [PARTICIPANT_ID, OFFLINE_DANI_ID],
      adminIds: [PARTICIPANT_ID],
      createdAt: "2026-08-09T09:15:00.000Z",
      archived: false
    }
  ],
  events: [
    {
      id: "event-friends-weekend",
      name: "סוף השבוע בצפון",
      eventType: "trip",
      currency: "ILS",
      participantIds: [PARTICIPANT_ID, MAOR_PARTICIPANT_ID, OFFLINE_DANI_ID],
      adminIds: [PARTICIPANT_ID],
      createdByParticipantId: PARTICIPANT_ID,
      createdAt: "2026-08-14T08:00:00.000Z",
      updatedAt: "2026-08-15T18:00:00.000Z",
      locked: false,
      expenses: [
        {
          id: "expense-weekend-taxi",
          name: "מונית",
          total: 18_000,
          payers: [{ participantId: PARTICIPANT_ID, amount: 18_000 }],
          sharedByParticipantIds: [PARTICIPANT_ID, MAOR_PARTICIPANT_ID, OFFLINE_DANI_ID],
          createdByParticipantId: PARTICIPANT_ID,
          updatedAt: "2026-08-14T09:00:00.000Z"
        },
        {
          id: "expense-weekend-food",
          name: "ארוחת ערב",
          total: 12_000,
          payers: [{ participantId: MAOR_PARTICIPANT_ID, amount: 12_000 }],
          sharedByParticipantIds: [PARTICIPANT_ID, MAOR_PARTICIPANT_ID],
          createdByParticipantId: MAOR_PARTICIPANT_ID,
          updatedAt: "2026-08-14T20:00:00.000Z"
        }
      ],
      transfers: [],
      activityLog: []
    },
    {
      id: "event-friends-dinner",
      name: "ארוחת ערב",
      eventType: "standard",
      currency: "ILS",
      participantIds: [PARTICIPANT_ID, MAOR_PARTICIPANT_ID],
      adminIds: [PARTICIPANT_ID],
      createdByParticipantId: MAOR_PARTICIPANT_ID,
      createdAt: "2026-08-05T18:00:00.000Z",
      updatedAt: "2026-08-05T20:00:00.000Z",
      locked: true,
      expenses: [
        {
          id: "expense-dinner-food",
          name: "ארוחת ערב",
          total: 20_000,
          payers: [{ participantId: MAOR_PARTICIPANT_ID, amount: 20_000 }],
          sharedByParticipantIds: [PARTICIPANT_ID, MAOR_PARTICIPANT_ID],
          createdByParticipantId: MAOR_PARTICIPANT_ID,
          updatedAt: "2026-08-05T19:00:00.000Z"
        }
      ],
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

  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      publicUrl: "http://127.0.0.1:4182",
      storage: {
        mode: "supabase",
        url: "https://friends-hub-polish.supabase.co",
        anonKey: "anon-key",
        table: "app_snapshots"
      }
    }
  }));
  await page.route("https://friends-hub-polish.supabase.co/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
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
    if (url.pathname.includes("/friendships")) {
      return route.fulfill({ headers: corsHeaders, json: friendships });
    }
    if (url.pathname.includes("/friend_invite_codes")) {
      return route.fulfill({ headers: corsHeaders, json: [{ code: "abcdef1234567890abcd" }] });
    }
    if (url.pathname.includes("/user_blocks")) {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    if (url.pathname.includes("/user_profiles")) {
      if (request.method() === "GET") {
        return route.fulfill({ headers: corsHeaders, json: profiles });
      }
      return route.fulfill({ headers: corsHeaders, json: [profiles[0]] });
    }
    if (url.pathname.includes("/app_snapshots")) {
      return route.fulfill({
        headers: corsHeaders,
        json: [{ state: seededState, updated_at: "2026-08-18T06:00:00.000Z" }]
      });
    }
    if (url.pathname.includes("/notification_inbox")) {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    if (request.method() === "GET") {
      return route.fulfill({ headers: corsHeaders, json: [] });
    }
    return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  });

  await page.addInitScript(({ participantId, state, userId, spaceId, spaceKey }) => {
    localStorage.clear();
    sessionStorage.clear();
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
  await page.locator('[data-nav-destination="profile"]').click();
  await page.locator('[data-action="groups"][data-tab="people"]').click();
  await expect(page.locator('[data-screen-kind="groups"][data-friends-tab="people"]'))
    .toBeVisible();
  await expect(page.locator('[data-friend-identity-section="connected"] .friend-row'))
    .toHaveCount(1);
});

test("friends and requests remain distinct while groups stay hidden without data loss", async ({ page }) => {
  await expect(page.locator('[data-friend-identity-section="offline"] .friend-row'))
    .toHaveCount(3);
  await expect(page.locator('[data-action="open-friend-add"]')).toBeVisible();
  await page.locator('[data-action="remove-network-friend"]').click({ trial: true });
  await page.locator('[data-action="remove-offline-friend"]').last().click({ trial: true });
  await assertNoHorizontalOverflow(page);
  await capture(page, "08b-friends-populated");

  await page.locator('[data-action="friends-hub-tab"][data-tab="requests"]').click();
  await expect(page.locator('[data-friends-tab="requests"]')).toBeVisible();
  await expect(page.locator('[data-action="accept-friend-request"]')).toHaveCount(1);
  await expect(page.locator('[data-action="cancel-friend-request"]')).toHaveCount(1);
  await page.locator('[data-action="cancel-friend-request"]').click({ trial: true });
  await assertNoHorizontalOverflow(page);
  await capture(page, "08c-friend-requests");

  await expect(page.locator('[data-action="friends-hub-tab"][data-tab="groups"]')).toHaveCount(0);
  await expect(page.locator(".groups-list-section")).toHaveCount(0);
  const storedGroups = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("settle-friends-state") || "{}");
    return state.groups?.length ?? 0;
  });
  expect(storedGroups).toBe(2);
  await assertNoHorizontalOverflow(page);
  await capture(page, "08d-groups-hidden");
});

test("friend relationship stays readable and legacy group routes return to friends", async ({ page }) => {
  await page
    .locator(
      '[data-friend-identity-section="connected"] .avatar[data-action="open-participant-statistics"]'
    )
    .click();
  await expect(page.locator('[data-friend-profile-id]')).toBeVisible();
  await expect(page.getByText("אתם במספרים", { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, "08e-friend-relationship");

  await page.locator('[data-action="go-back"]').click();
  await expect(page.locator('[data-friends-tab="people"]')).toBeVisible();
  await expect(page.locator('[data-action="new-group"]')).toHaveCount(0);
  await expect(page.locator('[data-screen-kind="group-edit"]')).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await capture(page, "08f-friends-only");
});

test("duplicate-name management opens on the merge task and keeps the full roster secondary", async ({ page }) => {
  await page.locator('[data-action="manage-people"]').click();
  await expect(page.locator('[data-screen-kind="people"]')).toBeVisible();
  await expect(page.locator('[data-action="merge-source"]')).toHaveValue(OFFLINE_MAOR_ID);
  await expect(page.locator('[data-action="merge-target"]')).toHaveValue(MAOR_PARTICIPANT_ID);
  await expect(page.locator('[data-action="merge-target"] option')).toHaveCount(1);

  const savedNames = page.locator(".people-management-disclosure");
  await expect(savedNames).not.toHaveAttribute("open", "");
  await assertNoHorizontalOverflow(page);
  await capture(page, "08h-people-merge");

  await savedNames.locator("summary").click();
  await expect(page.locator(".known-participant-row")).toHaveCount(5);
  await page.locator('[data-action="remove-participant"]').last().click({ trial: true });
  await assertNoHorizontalOverflow(page);
});

async function capture(page, name) {
  if (process.env.CAPTURE_FRIENDS_HUB !== "1") return;
  await page.screenshot({
    path: `design-audits/consistency-current/${name}.png`,
    fullPage: true
  });
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
