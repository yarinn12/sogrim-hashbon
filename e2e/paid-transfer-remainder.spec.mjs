import { expect, test } from "@playwright/test";

const EVENT_ID = "event-paid-remainder";
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
      name: "לובי בנים",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID, FRIEND_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-15T11:00:00.000Z",
      statusUpdatedAt: "2026-08-15T11:00:00.000Z",
      roundSettlementTransfers: false,
      expenses: [
        {
          id: "expense-first",
          name: "הוצאה ראשונה",
          total: 4000,
          payers: [{ participantId: OWNER_ID, amount: 4000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-15T10:15:00.000Z"
        },
        {
          id: "expense-second",
          name: "הוצאה נוספת",
          total: 2000,
          payers: [{ participantId: OWNER_ID, amount: 2000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-15T11:00:00.000Z"
        }
      ],
      transfers: [
        {
          id: "transfer-friend-owner-2000",
          fromParticipantId: FRIEND_ID,
          toParticipantId: OWNER_ID,
          amount: 2000,
          status: "paid",
          markedPaidByParticipantId: OWNER_ID,
          markedPaidAt: "2026-08-15T10:30:00.000Z",
          statusUpdatedAt: "2026-08-15T10:30:00.000Z"
        },
        {
          id: "transfer-friend-owner-1000",
          fromParticipantId: FRIEND_ID,
          toParticipantId: OWNER_ID,
          amount: 1000,
          status: "pending"
        }
      ],
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

test("a paid transfer and a later remainder stay in one relationship row", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`).first().click();

  const row = page.locator(".settlement-transfer-board .transfer-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("נשאר להעביר");
  await expect(row).toContainText("₪10.00");
  await expect(row).toContainText("כבר שולם");
  await expect(row).toContainText("₪20.00");

  await expect(row.locator(".transfer-paid-history")).toHaveAttribute("open", "");
  await expect(row.locator('[data-action="mark-pending"]')).toBeVisible();
  await row.locator('[data-action="mark-pending"]').click();

  const reconciledRow = page.locator(".settlement-transfer-board .transfer-row");
  await expect(reconciledRow).toHaveCount(1);
  await expect(reconciledRow).toContainText("₪30.00");
  await expect(reconciledRow.locator(".transfer-paid-history")).toHaveCount(0);
});
