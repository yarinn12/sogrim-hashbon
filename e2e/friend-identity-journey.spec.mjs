import { expect, test } from "@playwright/test";

const EVENT_ID = "event-identity-journey";
const OWNER_ID = "account-11111111-1111-4111-8111-111111111111";
const OFFLINE_ID = "guest-ariel-offline";
const ACCOUNT_ID = "account-22222222-2222-4222-8222-222222222222";
let runtimeIssues = [];

const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    {
      id: OWNER_ID,
      displayName: "ירין יצחק",
      kind: "user",
      accountLinked: true,
      authSubject: "11111111-1111-4111-8111-111111111111",
      avatarPreset: "avatar-1"
    },
    {
      id: OFFLINE_ID,
      displayName: "אריאל ניזרי",
      kind: "guest"
    },
    {
      id: ACCOUNT_ID,
      displayName: "אריאל ניזרי",
      kind: "member",
      accountLinked: true,
      authSubject: "22222222-2222-4222-8222-222222222222",
      avatarPreset: "avatar-2"
    }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "לובי של ניזרי",
      eventType: "standard",
      currency: "ILS",
      participantIds: [OWNER_ID, OFFLINE_ID, ACCOUNT_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-04T08:00:00.000Z",
      updatedAt: "2026-08-04T08:05:00.000Z",
      statusUpdatedAt: "2026-08-04T08:05:00.000Z",
      expenses: [
        {
          id: "expense-offline-payer",
          name: "מונית",
          total: 9_000,
          payers: [{ participantId: OFFLINE_ID, amount: 9_000 }],
          sharedByParticipantIds: [OWNER_ID, OFFLINE_ID, ACCOUNT_ID],
          createdByParticipantId: OFFLINE_ID,
          occurredOn: "2026-08-04",
          updatedAt: "2026-08-04T08:05:00.000Z"
        }
      ],
      transfers: [],
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page, request }, testInfo) => {
  runtimeIssues = [];
  page.on("pageerror", (error) => runtimeIssues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      runtimeIssues.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      !response.url().startsWith("https://fonts.gstatic.com/")
    ) {
      runtimeIssues.push(`response ${response.status()}: ${response.url()}`);
    }
  });

  const stateForTest = testInfo.title.includes("outside the friends list")
    ? {
        ...seededState,
        participants: seededState.participants.filter((participant) => participant.id !== ACCOUNT_ID),
        events: seededState.events.map((event) => ({
          ...event,
          participantIds: event.participantIds.filter((participantId) => participantId !== ACCOUNT_ID),
          expenses: event.expenses.map((expense) => ({
            ...expense,
            sharedByParticipantIds: expense.sharedByParticipantIds.filter(
              (participantId) => participantId !== ACCOUNT_ID
            )
          }))
        }))
      }
    : seededState;

  await request.post("/api/reset");
  await request.put("/api/state", { data: stateForTest });
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
  }, { participantId: OWNER_ID, state: stateForTest });

  await page.goto("/");
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT_ID}"]`))
    .toBeVisible();
});

test.afterEach(() => {
  expect(runtimeIssues, "identity reconciliation must not emit browser runtime errors").toEqual([]);
});

test("an offline name links to its connected account without losing money", async ({ page }) => {
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .click();
  await expect(page.locator(".event-participant-roster-modal")).toBeVisible();
  await expect(page.locator(".event-action-dock")).toHaveCount(0);

  await page
    .locator(`[data-action="review-duplicate-participants"][data-event-id="${EVENT_ID}"]`)
    .click();
  const identityDialog = page.locator('.event-modal[role="dialog"]');
  await expect(identityDialog).toContainText("אותו אדם?");
  await expect(identityDialog).toContainText("שם אופליין");
  await expect(identityDialog).toContainText("חבר באפליקציה");

  await page
    .locator(`[data-action="connect-duplicate-participant"][data-source-participant-id="${OFFLINE_ID}"][data-target-participant-id="${ACCOUNT_ID}"]`)
    .click();
  const confirmation = page.locator('.important-action-dialog[role="alertdialog"]');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("לפני האיחוד");
  await expect(confirmation).toContainText("1");
  await confirmation.locator('[data-action="confirm-important-action"]').click();

  await expect(identityDialog).toContainText("חשבון אחד");
  await expect(page.locator(".event-action-dock")).toHaveCount(0);

  await expect.poll(async () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state") || "{}"))
  ).toMatchObject({
    participants: expect.arrayContaining([
      expect.objectContaining({ id: ACCOUNT_ID, displayName: "אריאל ניזרי" })
    ]),
    events: [
      expect.objectContaining({
        id: EVENT_ID,
        participantIds: [OWNER_ID, ACCOUNT_ID],
        expenses: [
          expect.objectContaining({
            id: "expense-offline-payer",
            total: 9_000,
            createdByParticipantId: ACCOUNT_ID,
            payers: [{ participantId: ACCOUNT_ID, amount: 9_000 }],
            sharedByParticipantIds: [OWNER_ID, ACCOUNT_ID]
          })
        ]
      })
    ]
  });

  const savedState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("settle-friends-state") || "{}")
  );
  expect(savedState.participants.some((participant) => participant.id === OFFLINE_ID)).toBe(false);
  expect(savedState.events[0].expenses[0].total).toBe(9_000);
});

test("an offline name can invite an account outside the friends list with the standard share tools", async ({ page }) => {
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .click();
  await page
    .locator(`[data-action="open-event-participant-profile"][data-participant-id="${OFFLINE_ID}"]`)
    .click();

  const profileDialog = page.locator('[data-participant-detail-view="offline"]');
  await expect(profileDialog).toContainText("קישור לחשבון");
  await profileDialog.getByText("קישור לחשבון", { exact: true }).click();

  const linkDialog = page.locator('.event-participant-link-screen');
  const inviteAction = linkDialog.locator('[data-action="open-event-participant-link-invite"]');
  await expect(inviteAction).toBeVisible();
  await expect(inviteAction).toContainText("WhatsApp, העתקת קישור או סריקת QR");
  await inviteAction.click();

  const shareDialog = page.locator('[data-event-share-view="link"]');
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog.locator('[data-action="share-invite-whatsapp"]')).toBeVisible();
  await expect(shareDialog.locator('[data-action="copy-invite"]')).toBeVisible();
  await expect(page.locator('.event-share-modal')).toContainText("קישור קבוע, WhatsApp או QR");

  await page.locator('[data-action="event-share-back"]').click();
  await expect(page.locator('.event-participant-link-screen')).toBeVisible();
  await expect(page.locator('[data-action="open-event-participant-link-invite"]')).toBeVisible();
});
