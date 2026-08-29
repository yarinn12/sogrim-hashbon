import { expect, test } from "@playwright/test";

const EVENT_ID = "event-korea-regression";
const YARIN = "yarin";
const MAOR = "maor";
const LIRON = "liron";
const NIZRI = "nizri";

const seededState = {
  currentParticipantId: YARIN,
  participants: [
    { id: YARIN, displayName: "ירין יצחק", kind: "user", avatarPreset: "avatar-1" },
    { id: MAOR, displayName: "מאור", kind: "guest" },
    { id: LIRON, displayName: "לירון", kind: "guest" },
    { id: NIZRI, displayName: "ניזרי", kind: "guest" }
  ],
  friendContacts: [],
  groups: [],
  events: [{
    id: EVENT_ID,
    name: "קוריאה",
    eventType: "outing",
    currency: "ILS",
    participantIds: [YARIN, MAOR, LIRON, NIZRI],
    adminIds: [YARIN],
    createdByParticipantId: YARIN,
    directSettlementTransfers: true,
    roundSettlementTransfers: true,
    locked: false,
    expenses: [
      {
        id: "seoul-apartment",
        name: "דירה סיאול",
        total: 403600,
        payers: [{ participantId: YARIN, amount: 403600 }],
        sharedByParticipantIds: [YARIN, MAOR, LIRON, NIZRI],
        createdByParticipantId: YARIN
      },
      {
        id: "seoul-manila-flight",
        name: "טיסה סיאול למנילה",
        total: 128500,
        payers: [{ participantId: MAOR, amount: 128500 }],
        sharedByParticipantIds: [YARIN, MAOR, LIRON],
        createdByParticipantId: YARIN
      },
      {
        id: "yarin-flight",
        name: "טיסה ירין",
        total: 230000,
        payers: [{ participantId: MAOR, amount: 230000 }],
        sharedByParticipantIds: [YARIN],
        createdByParticipantId: YARIN
      }
    ],
    transfers: [{
      id: "paid-nizri-yarin-29800",
      fromParticipantId: NIZRI,
      toParticipantId: YARIN,
      amount: 29800,
      status: "paid",
      markedPaidAt: "2026-08-20T09:16:52.612Z",
      statusUpdatedAt: "2026-08-20T09:16:52.612Z"
    }],
    activityLog: []
  }],
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
  }, { participantId: YARIN, state: seededState });
  await page.goto("/");
});

test("Korea summary keeps the direct reimbursement between Yarin and Maor", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page.locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`).first().click();

  const yarinToMaor = page
    .locator(".settlement-transfer-board .transfer-row")
    .filter({ hasText: "מאור" })
    .filter({ hasText: "ירין יצחק" });
  await expect(yarinToMaor).toHaveCount(1);
  await expect(yarinToMaor).toContainText("1,720.00");
});
