import { expect, test } from "@playwright/test";

const EVENT_ID = "event-edit-payer-difference";
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
      updatedAt: "2026-08-15T10:30:00.000Z",
      statusUpdatedAt: "2026-08-15T10:30:00.000Z",
      roundSettlementTransfers: false,
      expenses: [
        {
          id: "expense-shared-payment",
          name: "קניות",
          total: 12000,
          payers: [
            { participantId: OWNER_ID, amount: 5000 },
            { participantId: FRIEND_ID, amount: 7000 }
          ],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-15T10:30:00.000Z"
        },
        {
          id: "expense-single-payment",
          name: "מונית",
          total: 10000,
          payers: [{ participantId: OWNER_ID, amount: 10000 }],
          sharedByParticipantIds: [OWNER_ID, FRIEND_ID],
          createdByParticipantId: OWNER_ID,
          updatedAt: "2026-08-15T10:45:00.000Z"
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

test("editing a multi-payer expense asks who owns the added amount", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();

  const expenseRow = page.locator('[data-expense-id="expense-shared-payment"]');
  await expenseRow.locator(".expense-row-actions-menu > summary").click();
  await expenseRow.locator('[data-action="edit-expense"]').click();

  const dialog = page.locator(".expense-modal");
  await dialog.locator('[data-action="expense-total"]').fill("140");
  await dialog.locator('[data-action="expense-step-next"]').click();
  await dialog.locator('[data-action="expense-step-next"]').click();

  const assignment = dialog.locator(".payer-difference-assignment");
  await expect(assignment).toBeVisible();
  await expect(assignment).toContainText("למי לשייך את התוספת?");
  await expect(assignment).toContainText("₪20.00");

  await assignment
    .locator('[data-action="assign-payer-difference"][data-index="0"]')
    .click();

  await expect(dialog.locator('[data-action="expense-payer-amount"][data-index="0"]'))
    .toHaveValue("70");
  await expect(dialog.locator('[data-action="expense-payer-amount"][data-index="1"]'))
    .toHaveValue("70.00");
  await expect(dialog.locator(".payer-difference-assignment")).toHaveCount(0);
  await expect(dialog.locator(".expense-payer-summary")).toContainText(
    "סכומי המשלמים תואמים לסכום הכולל"
  );
});

test("editing a single-payer expense assigns the added amount automatically", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();

  const expenseRow = page.locator('[data-expense-id="expense-single-payment"]');
  await expenseRow.locator(".expense-row-actions-menu > summary").click();
  await expenseRow.locator('[data-action="edit-expense"]').click();

  const dialog = page.locator(".expense-modal");
  await dialog.locator('[data-action="expense-total"]').fill("120");
  await dialog.locator('[data-action="expense-step-next"]').click();
  await dialog.locator('[data-action="expense-step-next"]').click();

  await expect(dialog.locator('[data-action="expense-payer-amount"]')).toHaveValue("120");
  await expect(dialog.locator(".payer-difference-assignment")).toHaveCount(0);
  await expect(dialog.locator(".expense-payer-summary")).toContainText(
    "סכומי המשלמים תואמים לסכום הכולל"
  );
});
