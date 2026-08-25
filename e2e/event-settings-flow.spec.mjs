import { expect, test } from "@playwright/test";
import {
  expectStrictSmoothness,
  finishStrictSmoothnessProbe,
  startStrictSmoothnessProbe
} from "./helpers/strict-smoothness.mjs";

const EVENT_ID = "event-settings-flow";
const OWNER_ID = "person-settings-owner";
const FRIEND_ID = "person-settings-friend";

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
      name: "בדיקת הגדרות",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID, FRIEND_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      adminsCanEditOnly: false,
      createdAt: "2026-08-19T08:00:00.000Z",
      updatedAt: "2026-08-19T08:30:00.000Z",
      settingsUpdatedAt: "2026-08-19T08:00:00.000Z",
      roundSettlementTransfers: true,
      directSettlementTransfers: false,
      locked: false,
      expenses: [
        {
          id: "expense-settings",
          name: "מונית",
          total: 12000,
          payers: [{ participantId: OWNER_ID, amount: 12000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-19T08:30:00.000Z"
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
    if (sessionStorage.getItem("event-settings-flow-seeded") === "1") {
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
      return;
    }
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
    sessionStorage.setItem("event-settings-flow-seeded", "1");
  }, { participantId: OWNER_ID, state: seededState });
  await page.goto("/");
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`).first().click();
});

test("event settings remain still while the user reads or scrolls", async ({ page }) => {
  const settingsDialog = page.locator('.event-settings-modal[role="region"]');
  await expect(settingsDialog).toBeVisible();
  const dangerCard = page.locator('[data-settings-section="danger"]');
  await dangerCard.scrollIntoViewIfNeeded();
  await dangerCard.focus();
  await page.waitForTimeout(500);

  await startStrictSmoothnessProbe(page);
  await page.waitForTimeout(2_000);
  expectStrictSmoothness(await finishStrictSmoothnessProbe(page));
});

test("event settings save smoothly, return focus and survive reload", async ({ page }) => {
  const settingsDialog = page.locator('.event-settings-modal[role="region"]');
  await expect(settingsDialog).toBeVisible();

  const managementCard = page.locator('[data-settings-section="management"]');
  await managementCard.click();
  const centralized = page.locator(
    '[data-action="set-event-management-mode"][data-management-mode="centralized"]'
  );
  await centralized.click();
  await expect(centralized).toHaveAttribute("aria-checked", "true");
  await expect(centralized).toBeFocused();
  await page.locator('[data-action="event-settings-back"]').click();
  await expect(managementCard).toBeFocused();

  const currencyCard = page.locator('[data-settings-section="currency"]');
  await currencyCard.click();
  const currency = page.locator('[data-action="event-currency"]');
  const currencyTrigger = page.locator(
    '[data-choice-select-action="event-currency"]'
  );
  await currencyTrigger.click();
  await page
    .locator('.app-choice-option[data-choice-value="USD"]')
    .click();
  const confirmation = page.locator('.important-action-dialog[role="alertdialog"]');
  await expect(confirmation).toContainText("הסכומים יישארו בדיוק כפי שהוזנו");
  await confirmation.locator('[data-action="confirm-important-action"]').click();
  await expect(currency).toHaveValue("USD");
  await expect(currencyTrigger).toBeFocused();
  await page.locator('[data-action="event-settings-back"]').click();
  await expect(currencyCard).toBeFocused();

  const repaymentCard = page.locator('[data-settings-section="repayment"]');
  await repaymentCard.click();
  const repaymentDialog = page.locator('.event-modal:has(.event-repayment-field)');
  const direct = page.locator(
    '[data-action="set-event-repayment-mode"][data-repayment-mode="direct"]'
  );
  const optimized = page.locator(
    '[data-action="set-event-repayment-mode"][data-repayment-mode="optimized"]'
  );
  await direct.click();
  await expect(direct).toHaveAttribute("aria-checked", "true");
  await expect(repaymentDialog).toContainText("נבחר כרגע: החזר לפי מי ששילם");
  await optimized.click();
  await expect(optimized).toHaveAttribute("aria-checked", "true");
  await expect(repaymentDialog).toContainText("נבחר כרגע: קיזוז חכם");
  await direct.click();
  await expect(direct).toHaveAttribute("aria-checked", "true");
  await expect(direct).toBeFocused();
  await page.locator('[data-action="event-settings-back"]').click();
  await expect(repaymentCard).toBeFocused();

  const roundingCard = page.locator('[data-settings-section="rounding"]');
  await roundingCard.click();
  const exact = page.locator(
    '[data-action="set-event-rounding-mode"][data-rounding-mode="exact"]'
  );
  await exact.click();
  await expect(exact).toHaveAttribute("aria-checked", "true");
  await expect(exact).toBeFocused();
  await page.locator('[data-action="event-settings-back"]').click();
  await expect(roundingCard).toBeFocused();

  const lockCard = page.locator('[data-settings-section="lock"]');
  await lockCard.click();
  const lock = page.locator('[data-action="toggle-lock"]');
  await lock.click();
  await expect(page.getByText("האירוע נעול לעריכה", { exact: true })).toBeVisible();
  await expect(lock).toHaveText("פתח עריכה");
  await expect(lock).toBeFocused();

  const saved = await page.evaluate((eventId) => {
    const state = JSON.parse(localStorage.getItem("settle-friends-state") || "{}");
    const event = state.events?.find((candidate) => candidate.id === eventId);
    return {
      adminsCanEditOnly: event?.adminsCanEditOnly,
      currency: event?.currency,
      directSettlementTransfers: event?.directSettlementTransfers,
      roundSettlementTransfers: event?.roundSettlementTransfers,
      locked: event?.locked
    };
  }, EVENT_ID);
  expect(saved).toEqual({
    adminsCanEditOnly: true,
    currency: "USD",
    directSettlementTransfers: true,
    roundSettlementTransfers: false,
    locked: true
  });

  await page.reload();
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`).first().click();
  await expect(page.locator('[data-settings-section="management"]')).toContainText("ניהול מרוכז");
  await expect(page.locator('[data-settings-section="currency"]')).toContainText("דולר אמריקאי");
  await expect(page.locator('[data-settings-section="repayment"]')).toContainText("לפי מי ששילם");
  await expect(page.locator('[data-settings-section="rounding"]')).toContainText("דיוק מלא באגורות");
  await expect(page.locator('[data-settings-section="lock"]')).toContainText("האירוע נעול");
});
