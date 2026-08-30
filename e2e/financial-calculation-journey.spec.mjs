import { expect, test } from "@playwright/test";

const OWNER_ID = "financial-owner";
const PARTICIPANTS = [
  { id: OWNER_ID, displayName: "ירין יצחק", kind: "user", avatarPreset: "avatar-1" },
  { id: "financial-b", displayName: "מאור", kind: "user", avatarPreset: "avatar-2" },
  { id: "financial-c", displayName: "לירון", kind: "user", avatarPreset: "avatar-3" },
  { id: "financial-d", displayName: "ניזרי", kind: "user", avatarPreset: "avatar-4" }
];

const EXPENSES = [
  {
    id: "financial-expense-1",
    name: "לינה",
    total: 10001,
    payers: [{ participantId: OWNER_ID, amount: 10001 }],
    sharedByParticipantIds: [OWNER_ID, "financial-b", "financial-c"],
    createdByParticipantId: OWNER_ID
  },
  {
    id: "financial-expense-2",
    name: "מונית",
    total: 7654,
    payers: [{ participantId: "financial-b", amount: 7654 }],
    sharedByParticipantIds: ["financial-b", "financial-c", "financial-d"],
    createdByParticipantId: "financial-b"
  },
  {
    id: "financial-expense-3",
    name: "כרטיסים",
    total: 4321,
    payers: [
      { participantId: "financial-c", amount: 2000 },
      { participantId: "financial-d", amount: 2321 }
    ],
    sharedByParticipantIds: [OWNER_ID, "financial-d"],
    createdByParticipantId: "financial-c"
  },
  {
    id: "financial-expense-4",
    name: "חטיפים",
    total: 999,
    payers: [
      { participantId: OWNER_ID, amount: 499 },
      { participantId: "financial-c", amount: 500 }
    ],
    sharedByParticipantIds: [OWNER_ID, "financial-b", "financial-c", "financial-d"],
    createdByParticipantId: OWNER_ID
  }
].map((expense, index) => ({
  ...expense,
  updatedAt: `2026-08-29T10:0${index}:00.000Z`
}));

function buildEvent(id, name, roundSettlementTransfers) {
  return {
    id,
    name,
    eventType: "outing",
    currency: "ILS",
    participantIds: PARTICIPANTS.map(({ id: participantId }) => participantId),
    adminIds: [OWNER_ID],
    createdByParticipantId: OWNER_ID,
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:05:00.000Z",
    statusUpdatedAt: "2026-08-29T10:05:00.000Z",
    settingsUpdatedAt: "2026-08-29T10:05:00.000Z",
    roundSettlementTransfers,
    directSettlementTransfers: false,
    locked: false,
    expenses: EXPENSES,
    transfers: [],
    activityLog: []
  };
}

const seededState = {
  currentParticipantId: OWNER_ID,
  participants: PARTICIPANTS,
  friendContacts: [],
  groups: [],
  events: [
    buildEvent("financial-exact", "בדיקת אגורות", false),
    buildEvent("financial-rounded", "בדיקת עיגול", true)
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

async function openSummary(page, eventId) {
  await page
    .locator(`[data-action="open-event"][data-event-id="${eventId}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();
  const summary = page.locator(
    `[data-screen-kind="event"][data-event-view="summary"][data-event-id="${eventId}"]`
  );
  await expect(summary).toBeVisible();
  return summary;
}

async function expectTransfer(summary, transferId, fromName, toName, formattedAmount) {
  const row = summary.locator(`.transfer-row[data-transfer-id="${transferId}"]`);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(fromName);
  await expect(row).toContainText(toName);
  await expect(row.locator(".transfer-amount .amount")).toHaveText(`₪${formattedAmount}`);
  await expect(row).toHaveAttribute(
    "aria-label",
    new RegExp(`${fromName}.*${formattedAmount}.*${toName}`)
  );
  return row;
}

test("awkward agorot reach the UI exactly and paid undo preserves every route", async ({ page }) => {
  const summary = await openSummary(page, "financial-exact");

  await expect(summary.locator(".settlement-transfer-board .transfer-row")).toHaveCount(3);
  const lironToYarin = await expectTransfer(
    summary,
    "transfer-financial-c-financial-owner-3634",
    "לירון",
    "ירין יצחק",
    "36.34"
  );
  await expectTransfer(
    summary,
    "transfer-financial-d-financial-b-1518",
    "ניזרי",
    "מאור",
    "15.18"
  );
  await expectTransfer(
    summary,
    "transfer-financial-d-financial-owner-1121",
    "ניזרי",
    "ירין יצחק",
    "11.21"
  );

  await summary.locator('[data-action="close-event"]').first().click();
  await page.locator('[data-action="confirm-close-event"]').click();
  await expect(lironToYarin.locator('[data-action="mark-paid"]')).toBeVisible();
  await lironToYarin.locator('[data-action="mark-paid"]').click();
  await expect(
    summary.locator(
      '.transfer-row[data-transfer-id="transfer-financial-c-financial-owner-3634"] [data-action="mark-pending"]'
    )
  ).toBeVisible();
  await summary
    .locator(
      '.transfer-row[data-transfer-id="transfer-financial-c-financial-owner-3634"] [data-action="mark-pending"]'
    )
    .click();

  await expect(summary.locator(".settlement-transfer-board .transfer-row")).toHaveCount(3);
  await expectTransfer(
    summary,
    "transfer-financial-c-financial-owner-3634",
    "לירון",
    "ירין יצחק",
    "36.34"
  );
  await expectTransfer(
    summary,
    "transfer-financial-d-financial-b-1518",
    "ניזרי",
    "מאור",
    "15.18"
  );
  await expectTransfer(
    summary,
    "transfer-financial-d-financial-owner-1121",
    "ניזרי",
    "ירין יצחק",
    "11.21"
  );
});

test("whole-shekel mode rounds only transfers while retaining balanced UI totals", async ({ page }) => {
  const summary = await openSummary(page, "financial-rounded");

  await expect(summary.locator(".settlement-transfer-board .transfer-row")).toHaveCount(3);
  await expectTransfer(
    summary,
    "transfer-financial-c-financial-owner-3600",
    "לירון",
    "ירין יצחק",
    "36.00"
  );
  await expectTransfer(
    summary,
    "transfer-financial-d-financial-b-1500",
    "ניזרי",
    "מאור",
    "15.00"
  );
  await expectTransfer(
    summary,
    "transfer-financial-d-financial-owner-1100",
    "ניזרי",
    "ירין יצחק",
    "11.00"
  );

  const displayedAmounts = await summary
    .locator(".settlement-transfer-board .transfer-row .transfer-amount .amount")
    .allTextContents();
  const displayedAgorot = displayedAmounts.map((amount) =>
    Math.round(Number(amount.replace(/[^\d.]/g, "")) * 100)
  );
  expect(displayedAgorot.reduce((sum, amount) => sum + amount, 0)).toBe(6200);
});
