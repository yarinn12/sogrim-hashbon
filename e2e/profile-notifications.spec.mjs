import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const USER_ID = "profile-notifications-user";
const PARTICIPANT_ID = `account-${USER_ID}`;
const EVENT_ID = "profile-notifications-event";
const SPACE_ID = "space-profile-notifications";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz_123456";
const REFERRAL_CODE = "0123456789abcdefabcd";

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
  let referralStatusAttempts = 0;
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
    if (url.pathname.endsWith("/auth/v1/token")) {
      return route.fulfill({
        headers: corsHeaders,
        json: {
          access_token: "refreshed-access-token",
          refresh_token: "refreshed-refresh-token",
          token_type: "bearer",
          expires_in: 3600
        }
      });
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
    if (url.pathname.endsWith("/rest/v1/rpc/get_referral_program_status")) {
      referralStatusAttempts += 1;
      if (referralStatusAttempts === 1) {
        return route.fulfill({
          status: 401,
          headers: corsHeaders,
          json: { code: "PGRST301", message: "JWT expired" }
        });
      }
      return route.fulfill({
        headers: corsHeaders,
        json: {
          referral_code: REFERRAL_CODE,
          reward_days: 30,
          annual_reward_limit: 12,
          rewarded_referrals: 2,
          pending_referrals: 1,
          rejected_referrals: 0,
          days_earned: 60,
          lifetime_rewarded_referrals: 2,
          lifetime_days_earned: 60,
          ad_free_until: null,
          ad_free_active: false,
          subscription_active: false,
          active_entitlement_sources: []
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

test("full name and username are full-width rows stacked in reading order", async ({ page }) => {
  await page.locator('[data-nav-destination="profile"]').click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();

  const nameRow = page.locator('[data-profile-identity="display-name"]');
  const usernameRow = page.locator('[data-profile-identity="username"]');
  await expect(nameRow).toBeVisible();
  await expect(usernameRow).toBeVisible();

  const [gridBox, nameBox, usernameBox] = await Promise.all([
    page.locator(".profile-identity-grid").boundingBox(),
    nameRow.boundingBox(),
    usernameRow.boundingBox()
  ]);
  expect(gridBox).not.toBeNull();
  expect(nameBox).not.toBeNull();
  expect(usernameBox).not.toBeNull();
  expect(usernameBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height + 8);
  expect(Math.abs(nameBox.x - usernameBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(nameBox.width - usernameBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(nameBox.width - gridBox.width)).toBeLessThanOrEqual(1);
  await assertNoHorizontalOverflow(page);
});

test("ad-free gift opens as a focused share workspace with a working QR", async ({ page }) => {
  const entry = page.locator(
    '[data-open-referral-rewards][data-referral-context="home"]'
  );
  await expect(entry).toBeVisible();
  await entry.click();

  const dialog = page.locator("#public-referral-rewards-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".referral-dialog-lead")).toContainText("חודש שקט");
  await expect(dialog.locator(".referral-gift-card")).toBeVisible();
  await expect(dialog.locator(".referral-benefit-card")).toContainText(
    "30ימים בלי פרסומות"
  );
  await expect(dialog.locator('[data-referral-qr] svg')).toHaveAttribute(
    "aria-label",
    "QR להזמנת חברים לסוגרים חשבון"
  );
  await expect(dialog.locator(".referral-link-field input")).toHaveValue(
    `http://127.0.0.1:4182/r/${REFERRAL_CODE}`
  );
  await expect(dialog.locator(".referral-state-message.is-stale")).toHaveCount(0);
  await expect(dialog.locator(".referral-more-details")).not.toHaveAttribute("open", "");
  if (process.env.CAPTURE_REFERRAL_GIFT === "1") {
    await dialog.screenshot({
      path: "work/referral-gift-mobile.png",
      animations: "disabled"
    });
  }

  const visualState = await dialog.evaluate((element) => {
    const header = element.querySelector(".referral-dialog-header");
    const benefit = element.querySelector(".referral-benefit-card");
    const qr = element.querySelector("[data-referral-qr] svg");
    const shareWorkspace = element.querySelector(".referral-share-workspace");
    const shareButton = element.querySelector('[data-referral-action="share"]');
    const content = element.querySelector(".referral-dialog-content");
    const giftCard = element.querySelector(".referral-gift-card");
    const shareSection = element.querySelector(".referral-share-section");
    return {
      headerBackgroundColor: getComputedStyle(header).backgroundColor,
      headerDecorationDisplay: getComputedStyle(header, "::before").display,
      benefitBackground: getComputedStyle(benefit).backgroundImage,
      qrWidth: qr.getBoundingClientRect().width,
      qrTop: qr.closest("[data-referral-qr]").getBoundingClientRect().top,
      shareButtonTop: shareButton.getBoundingClientRect().top,
      shareButtonBottom: shareButton.getBoundingClientRect().bottom,
      shareButtonHeight: shareButton.getBoundingClientRect().height,
      giftCardBottom: giftCard.getBoundingClientRect().bottom,
      shareSectionBottom: shareSection.getBoundingClientRect().bottom,
      contentTop: content.getBoundingClientRect().top,
      headerBottom: header.getBoundingClientRect().bottom,
      shareColumns: getComputedStyle(shareWorkspace).gridTemplateColumns,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expect(visualState.headerBackgroundColor).toMatch(/rgba?\(255, 255, 255/);
  expect(visualState.headerDecorationDisplay).toBe("none");
  expect(visualState.benefitBackground).toContain("linear-gradient");
  expect(
    visualState.qrWidth,
    `viewport=${visualState.viewportWidth}, columns=${visualState.shareColumns}`
  ).toBeGreaterThanOrEqual(140);
  expect(visualState.shareButtonHeight).toBeGreaterThanOrEqual(44);
  if (visualState.viewportWidth <= 760) {
    expect(visualState.shareButtonTop).toBeLessThan(visualState.qrTop);
    expect(visualState.contentTop).toBeLessThan(160);
  }
  expect(visualState.shareButtonBottom).toBeLessThanOrEqual(visualState.viewportHeight + 1);
  expect(visualState.contentTop).toBeLessThanOrEqual(visualState.headerBottom + 2);
  expect(visualState.giftCardBottom).toBeGreaterThanOrEqual(visualState.shareSectionBottom - 1);
  await assertNoHorizontalOverflow(page);

  const linkDetails = dialog.locator(".referral-link-details");
  await expect(linkDetails.locator("input")).not.toBeVisible();
  await linkDetails.locator(":scope > summary").click();
  await expect(linkDetails).toHaveAttribute("open", "");
  await expect(linkDetails.locator("input")).toBeVisible();

  const moreDetails = dialog.locator(".referral-more-details");
  await moreDetails.scrollIntoViewIfNeeded();
  await moreDetails.locator(":scope > summary").click();
  await expect(moreDetails).toHaveAttribute("open", "");
  await expect(moreDetails.locator(".referral-progress-section")).toBeVisible();
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
