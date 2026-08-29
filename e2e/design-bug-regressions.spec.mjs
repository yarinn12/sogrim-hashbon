import { expect, test } from "@playwright/test";

const OWNER_ID = "person-design-regression-owner";
const EVENT_ID = "event-design-regression";
const RESTAURANT_EVENT_ID = "event-design-regression-restaurant";

const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    {
      id: OWNER_ID,
      displayName: "ירין יצחק",
      kind: "user",
      avatarPreset: "avatar-1"
    }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "אירוע בדיקת רגרסיה",
      eventType: "standard",
      currency: "ILS",
      participantIds: [OWNER_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-26T08:00:00.000Z",
      updatedAt: "2026-08-26T08:00:00.000Z",
      roundSettlementTransfers: true,
      directSettlementTransfers: false,
      locked: false,
      expenses: [],
      transfers: [],
      activityLog: []
    },
    {
      id: RESTAURANT_EVENT_ID,
      name: "מסעדת בדיקת רגרסיה",
      eventType: "restaurant",
      currency: "ILS",
      participantIds: [OWNER_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-26T09:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z",
      roundSettlementTransfers: true,
      directSettlementTransfers: false,
      locked: false,
      expenses: [],
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
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
});

test("username editing never opens an empty action row", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("lang", "he-IL");
  await page.locator('.product-nav-button[data-nav-destination="profile"]').click();
  const usernameRow = page.locator('[data-profile-identity="username"]');
  const usernameValue = usernameRow.locator(".profile-identity-copy > strong");
  await usernameValue.locator("bdi").evaluate((element) => {
    element.textContent = `@${"very-long-username-".repeat(12)}`;
  });
  await expect(usernameValue).toHaveCSS("overflow", "hidden");
  await expect(usernameValue).toHaveCSS("white-space", "nowrap");
  await expect(usernameValue).toHaveCSS("text-overflow", "ellipsis");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );

  await usernameRow.locator('[data-action="edit-profile-username"]').click();

  await expect(usernameRow.locator(".profile-username-status")).toContainText(
    "זמינה אחרי חיבור לחשבון"
  );
  await expect(usernameRow.locator('[data-action="save-profile"]')).toHaveCount(0);
  await expect(
    usernameRow.locator('[data-action="cancel-profile-username-edit"]')
  ).toBeVisible();
});

test("expense templates preserve a custom name and still switch templates", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const expenseDialog = page.locator('.expense-step-modal[role="dialog"]');
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.locator('[data-action="expense-step-next"]').click();
  await expect(expenseDialog).toHaveAttribute("data-expense-step", "name");

  const expenseName = page.locator('[data-action="expense-name"]');
  await expenseName.fill("ארוחת יום הולדת");
  await page.locator('[data-action="expense-template"][data-template="אוכל"]').click();
  await expect(expenseName).toHaveValue("ארוחת יום הולדת");

  await expenseName.fill("");
  await page.locator('[data-action="expense-template"][data-template="אוכל"]').click();
  await expect(expenseName).toHaveValue("אוכל");
  await page.locator('[data-action="expense-template"][data-template="שתייה"]').click();
  await expect(expenseName).toHaveValue("שתייה");
});

test("restaurant expense back and accessibility controls never overlap", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${RESTAURANT_EVENT_ID}"]`)
    .first()
    .click();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${RESTAURANT_EVENT_ID}"]`)
    .first()
    .click();
  await page.locator('[data-action="restaurant-split-mode"][data-mode="equal"]').click();

  const back = page.locator('.expense-modal-step-header [data-action="expense-step-back"]');
  const accessibility = page.locator('.expense-modal-step-header .expense-accessibility-button');
  await expect(back).toBeVisible();
  await expect(accessibility).toBeVisible();
  await expect(
    page.locator('.expense-modal-step-header [data-action="cancel-expense"]')
  ).toHaveCount(0);
  const [backBox, accessibilityBox] = await Promise.all([
    back.boundingBox(),
    accessibility.boundingBox()
  ]);
  expect(backBox).not.toBeNull();
  expect(accessibilityBox).not.toBeNull();
  const separated =
    backBox.x + backBox.width <= accessibilityBox.x ||
    accessibilityBox.x + accessibilityBox.width <= backBox.x;
  expect(separated, "back and accessibility controls must occupy separate header columns").toBe(true);
});

test("a failed share link stops loading and explains the unavailable action", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="open-event-participant-add"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page.locator('[data-action="open-event-share"]').click();

  const shareDialog = page.locator(".event-share-modal");
  const shareStatus = shareDialog.locator(".event-share-link-status");
  const whatsappButton = shareDialog.locator('[data-action="share-invite-whatsapp"]');
  await expect(shareStatus).toHaveClass(/is-error/);
  await expect(shareStatus).toContainText("הקישור לא זמין");
  await expect(whatsappButton).toBeDisabled();
  await expect(whatsappButton).toHaveText("הקישור לא זמין");
  await expect(whatsappButton).not.toHaveAttribute("aria-busy", "true");
  await expect(shareDialog.locator('[data-action="retry-event-share"]')).toBeVisible();
});
