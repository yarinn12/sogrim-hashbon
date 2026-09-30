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

test("expense rows show each payer's amount before expanding or editing", async ({ page }, testInfo) => {
  const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
  if (dynamicType) await page.goto(`/?dynamic-type-preview=${dynamicType}`);
  if (testInfo.project.metadata?.reflowScale) {
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale * 100}%`; }, testInfo.project.metadata.reflowScale);
  }
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();

  const sharedRow = page.locator('[data-expense-id="expense-shared-payment"]');
  const entries = sharedRow.locator(".expense-paid-by-entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toHaveText(/ירין יצחק\s+₪50\.00/);
  await expect(entries.nth(1)).toHaveText(/דני כהן\s+₪70\.00/);
  for (const entry of await entries.all()) {
    await expect(entry.locator(".expense-paid-by-name")).toBeVisible();
    await expect(entry.locator(".expense-paid-by-amount")).toBeVisible();
  }
  await expect(sharedRow.locator(".expense-actions .amount")).toHaveText("₪120.00");
  await expect(sharedRow.locator(".expense-participants-details")).not.toHaveAttribute("open", "");

  const singleRow = page.locator('[data-expense-id="expense-single-payment"]');
  await expect(singleRow.locator(".expense-paid-by-entry")).toHaveText(/ירין יצחק\s+₪100\.00/);
  await expect(singleRow.locator(".expense-paid-by-label")).toHaveText("שילם:");

  // Every payer must fit without the one-line truncation used for secondary metadata.
  await expect.poll(() => sharedRow.locator(".expense-paid-by").evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth + 1 && rect.left >= -1 && rect.right <= innerWidth + 1;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("expense-payer-breakdown.png"), fullPage: true });

  await sharedRow.locator(".expense-row-main").click();
  await expect(sharedRow.locator(".expense-participants-details")).toHaveAttribute("open", "");
  await expect(entries.nth(1)).toBeVisible();
});

test("editing a multi-payer expense asks who owns the added amount", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();

  const expenseRow = page.locator('[data-expense-id="expense-shared-payment"]');
  await expenseRow.locator(".expense-row-actions-menu > summary").click();
  await expenseRow.locator('[data-action="edit-expense"]').click();

  const dialog = page.locator(".expense-modal");
  await expect(dialog).toHaveAttribute("data-expense-step", "review");
  await dialog.locator('[data-action="expense-step-edit"][data-step="amount"]').click();
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
    "הסכום הושלם"
  );
});

test("editing a single-payer expense assigns the added amount automatically", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();

  const expenseRow = page.locator('[data-expense-id="expense-single-payment"]');
  await expenseRow.locator(".expense-row-actions-menu > summary").click();
  await expenseRow.locator('[data-action="edit-expense"]').click();

  const dialog = page.locator(".expense-modal");
  await expect(dialog).toHaveAttribute("data-expense-step", "review");
  await dialog.locator('[data-action="expense-step-edit"][data-step="amount"]').click();
  await dialog.locator('[data-action="expense-total"]').fill("120");
  await dialog.locator('[data-action="expense-step-next"]').click();
  await dialog.locator('[data-action="expense-step-next"]').click();

  await expect(dialog.locator('[data-action="expense-payer-amount"]')).toHaveValue("120");
  await expect(dialog.locator(".payer-difference-assignment")).toHaveCount(0);
  await expect(dialog.locator(".expense-payer-summary")).toContainText(
    "הסכום הושלם"
  );
});
