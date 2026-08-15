import { expect, test } from "@playwright/test";

const EVENT_ID = "event-direct-repayment";
const OWNER_ID = "person-owner";
const FRIEND_ID = "person-friend";
const GUEST_ID = "person-guest";

const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    { id: OWNER_ID, displayName: "ירין יצחק", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND_ID, displayName: "דני כהן", kind: "user", avatarPreset: "avatar-2" },
    { id: GUEST_ID, displayName: "אבי לוי", kind: "guest" }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "בדיקת החזרים",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID, FRIEND_ID, GUEST_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      adminsCanEditOnly: false,
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-15T11:00:00.000Z",
      settingsUpdatedAt: "2026-08-15T10:00:00.000Z",
      roundSettlementTransfers: false,
      directSettlementTransfers: false,
      locked: false,
      expenses: [
        {
          id: "expense-taxi",
          name: "מונית",
          total: 9000,
          payers: [{ participantId: OWNER_ID, amount: 9000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID, GUEST_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-15T10:15:00.000Z"
        },
        {
          id: "expense-food",
          name: "אוכל",
          total: 6000,
          payers: [{ participantId: FRIEND_ID, amount: 6000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: FRIEND_ID,
          updatedAt: "2026-08-15T11:00:00.000Z"
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

test("a manager can keep every reimbursement attached to the original payer", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`).first().click();
  await expect(page.getByText("חלוקת ההחזרים", { exact: true })).toBeVisible();
  await page.locator('[data-settings-section="repayment"]').click();

  const directOption = page.locator(
    '[data-action="set-event-repayment-mode"][data-repayment-mode="direct"]'
  );
  await expect(directOption).toBeVisible();
  await expect(directOption).toContainText("לפי מי ששילם");
  await directOption.click();
  await expect(directOption).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("סימוני תשלום שכבר בוצעו נשמרים")).toBeVisible();

  const savedDirectMode = await page.evaluate((eventId) => {
    const state = JSON.parse(localStorage.getItem("settle-friends-state") || "{}");
    return state.events?.find((event) => event.id === eventId)?.directSettlementTransfers;
  }, EVENT_ID);
  expect(savedDirectMode).toBe(true);

  await page.locator('[data-action="event-settings-back"]').click();
  await page.locator('[data-action="close-event-dialog"]').click();
  await page.locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`).first().click();

  const rows = page.locator(".settlement-transfer-board .transfer-row");
  await expect(rows).toHaveCount(3);
  await rows.first().locator(".transfer-explanation > summary").click();
  await expect(rows.first().locator(".transfer-minimization-note")).toContainText(
    "החזר ישיר למי ששילם"
  );
});
