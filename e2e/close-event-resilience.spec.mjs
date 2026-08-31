import { expect, test } from "@playwright/test";

const EVENT_ID = "event-close-resilience";
const OWNER_ID = "person-owner";
const FRIEND_ID = "person-friend";

const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    { id: OWNER_ID, displayName: "ירין יצחק", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND_ID, displayName: "דני כהן", kind: "user", avatarPreset: "avatar-2" }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "בדיקת סגירה",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID, FRIEND_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-27T08:00:00.000Z",
      updatedAt: "2026-08-27T08:10:00.000Z",
      statusUpdatedAt: "2026-08-27T08:10:00.000Z",
      roundSettlementTransfers: false,
      expenses: [
        {
          id: "expense-close-resilience",
          name: "מונית",
          total: 10000,
          payers: [{ participantId: OWNER_ID, amount: 10000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-27T08:10:00.000Z"
        }
      ],
      notes: [
        {
          id: "note-close-resilience",
          title: "פרטי טיסה",
          body: "טרמינל 3",
          pinned: false,
          createdByParticipantId: OWNER_ID,
          updatedByParticipantId: OWNER_ID,
          createdAt: "2026-08-27T08:05:00.000Z",
          updatedAt: "2026-08-27T08:05:00.000Z"
        }
      ],
      transfers: [],
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: seededState });
  await page.addInitScript(({ participantId, state }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId,
        displayName: "ירין יצחק",
        avatarPreset: "avatar-1"
      })
    );
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { participantId: OWNER_ID, state: seededState });
  await page.goto("/");
});

test("event closing remains responsive behind a stale sync lock", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page.locator('.event-workspace-summary[data-action="settle"]').click();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("sogrim:sync-status", { detail: { status: "offline" } })
    );
  });

  await page.locator('[data-action="close-event"]').first().click();
  const confirmation = page.locator(".settlement-close-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("בואו נסגור חשבון?");
  const confirmationCenterOffset = await confirmation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
  });
  expect(confirmationCenterOffset).toBeLessThan(36);

  const confirmButton = confirmation.locator('[data-action="confirm-close-event"]');
  await expect(confirmButton).toHaveText("סוגרים חשבון");
  await expect(confirmButton).not.toHaveAttribute("aria-disabled", "true");
  await confirmButton.click({ timeout: 5000 });

  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".settlement-screen")).toContainText("האירוע נסגר");
  const reopenButton = page.locator(
    ".settlement-hero-actions > .settlement-reopen-action"
  );
  await expect(reopenButton).toBeVisible();
  await expect(reopenButton).toHaveText("פתח אירוע מחדש");
  await expect.poll(async () =>
    page.evaluate(({ eventId }) => {
      const state = JSON.parse(localStorage.getItem("settle-friends-state") || "{}");
      return state.events?.find((event) => event.id === eventId)?.locked;
    }, { eventId: EVENT_ID })
  ).toBe(true);

  await expect(page.locator('[data-app-dialog-inert], [data-app-dialog-inert-container]')).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/app-dialog-open/);

  const homeButton = page.locator('.product-app-nav [data-action="home"]').first();
  await expect(homeButton).toBeEnabled();
  await homeButton.click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "home");

  const profileButton = page.locator('.product-app-nav [data-action="edit-profile"]').first();
  await expect(profileButton).toBeEnabled();
  await profileButton.click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "profile");
});

async function delayBackgroundRequests(page, delayMs = 2500) {
  await page.route("**/*", async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType !== "fetch" && resourceType !== "xhr") {
      await route.continue();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "simulated slow sync" })
    });
  });
}

test("participants open immediately while the foreground sync is slow", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await delayBackgroundRequests(page);

  await page.locator('[data-action="open-event-participants"]').click();
  await expect(page.locator(".event-participant-roster-modal")).toBeVisible({
    timeout: 800
  });
});

test("share opens immediately while the foreground sync is slow", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await delayBackgroundRequests(page);

  await page
    .locator('.event-header-actions [data-action="open-event-participant-add"]')
    .click();
  const shareDialog = page.locator(".event-participant-add-route-modal");
  await expect(shareDialog).toBeVisible({ timeout: 800 });
  await expect(shareDialog).toContainText("מי מצטרף לאירוע?");
});

test("new expense opens immediately while the foreground sync is slow", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await delayBackgroundRequests(page);

  await page.locator('[data-action="show-expense-form"]').first().click();
  await expect(page.locator(".expense-modal")).toBeVisible({ timeout: 800 });
});

test("expense editing opens immediately while the foreground sync is slow", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await delayBackgroundRequests(page);

  const expense = page.locator('[data-expense-id="expense-close-resilience"]');
  await expense.locator(".expense-row-actions-menu > summary").click();
  await expense.locator('[data-action="edit-expense"]').click();
  await expect(page.locator(".expense-modal")).toBeVisible({ timeout: 800 });
});

test("the entire existing note card opens immediately while the foreground sync is slow", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page.locator('[data-action="open-event-notes"]').click();
  await delayBackgroundRequests(page);

  const noteCard = page.locator(
    '.event-note-row[data-action="open-event-note"][data-note-id="note-close-resilience"]'
  );
  await noteCard.locator(".event-note-avatars").click();
  await expect(page.locator(".event-note-modal")).toBeVisible({ timeout: 800 });
});

test("event workspace tabs remain responsive while foreground sync is slow", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await delayBackgroundRequests(page);

  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('[data-screen-kind="event-notes"]')).toBeVisible({ timeout: 800 });

  await page.locator('[data-action="back-to-event"]').click();
  await expect(page.locator('[data-screen-kind="event"]')).toBeVisible({ timeout: 800 });

  await page.locator('.event-workspace-summary[data-action="settle"]').click();
  await expect(page.locator('[data-event-view="summary"]')).toBeVisible({ timeout: 800 });
});
