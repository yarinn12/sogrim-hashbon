import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const OWNER = "person-platform-coherence-owner";
const PEER = "person-platform-coherence-peer";
const OPEN_EVENT = "event-platform-coherence-open";
const CLOSED_EVENT = "event-platform-coherence-closed";
const EXPENSE = "expense-platform-coherence-train";
const TITLE = "פרטי הנסיעה המשותפת והרכבת מירושלים לתל אביב ביום שישי";
const BODY = "נפגשים ברציף שלוש בשעה שמונה וחצי. שומרים כרטיסים, כתובות ומספרי טלפון כדי שכל המשתתפים יראו את אותו המידע גם לאחר חזרה למסך הקודם ורענון.";
const EXPENSE_NOTE = "הכרטיסים נקנו יחד והקבלה נשלחה לכל המשתתפים לפני היציאה לדרך.";
const UPDATED_AT = "2026-10-01T08:00:00.000Z";

const state = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: "ירין יצחק", kind: "user", avatarPreset: "avatar-1" },
    { id: PEER, displayName: "מאור סיבוני", kind: "guest", avatarPreset: "avatar-2" }
  ],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [
    { id: OPEN_EVENT,
      name: "מסע סוף שבוע ארוך במיוחד לירושלים ולתל אביב עם כל החברים",
      eventType: "trip", currency: "ILS", participantIds: [OWNER, PEER], adminIds: [OWNER],
      createdByParticipantId: OWNER, createdAt: UPDATED_AT, updatedAt: UPDATED_AT,
      statusUpdatedAt: UPDATED_AT, roundSettlementTransfers: true,
      locked: false, notes: [], transfers: [], activityLog: [],
      expenses: [{ id: EXPENSE,
        name: "כרטיסי רכבת מירושלים לתל אביב עבור כל המשתתפים בטיול",
        total: 12600, payers: [{ participantId: OWNER, amount: 12600 }],
        sharedByParticipantIds: [OWNER, PEER], createdByParticipantId: OWNER,
        occurredOn: "2026-10-01", updatedAt: UPDATED_AT }] },
    { id: CLOSED_EVENT, name: "אירוע סגור עם מידע משותף לקריאה בלבד",
      eventType: "outing", currency: "ILS", participantIds: [OWNER, PEER], adminIds: [OWNER],
      createdByParticipantId: OWNER, createdAt: UPDATED_AT, updatedAt: UPDATED_AT,
      statusUpdatedAt: UPDATED_AT, locked: true, expenses: [], transfers: [], activityLog: [],
      notes: [{ id: "note-platform-coherence-closed", title: "פרטי אירוע סגור",
        body: "המידע נשמר לקריאה לאחר סגירת האירוע.", pinned: true,
        createdByParticipantId: OWNER, updatedByParticipantId: OWNER,
        createdAt: UPDATED_AT, updatedAt: UPDATED_AT }] }
  ]
};

async function openEvent(page, eventId) {
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${eventId}"]`)).toBeVisible();
}

async function assertNoHorizontalOverflow(page, label) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(widths.document, `${label}: document horizontal overflow`).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, `${label}: body horizontal overflow`).toBeLessThanOrEqual(widths.viewport + 1);
}

async function assertTappable(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  const hit = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return element.contains(document.elementFromPoint(x, y));
  });
  expect(hit, `${label}: center must receive a tap`).toBe(true);
}

test.beforeEach(async ({ page, request }, testInfo) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ state, owner, injectNoteWriteFailure }) => {
    if (!sessionStorage.getItem("platform-coherence-seeded")) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId: owner, displayName: "ירין יצחק", avatarPreset: "avatar-1"
      }));
      localStorage.setItem("settle-friends-current-participant", owner);
      sessionStorage.setItem("platform-coherence-seeded", "1");
    }
    // Opt-in fault injection proves that the reload assertion detects a dropped final write.
    if (injectNoteWriteFailure) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "settle-friends-state") {
          try {
            const next = JSON.parse(value);
            if (next.events?.some(event => event.id === "event-platform-coherence-open" && event.notes?.length)) return;
          } catch { /* Preserve the real storage behavior for non-JSON values. */ }
        }
        return original.call(this, key, value);
      };
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state, owner: OWNER, injectNoteWriteFailure: process.env.PLATFORM_COHERENCE_FAULT === "drop-note-write" });
  const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
  await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/");
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
});

test("empty note, validation, long pinned save, return and reload remain coherent", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openEvent(page, OPEN_EVENT);
  await page.locator('[data-action="open-event-notes"]').click();
  const notes = page.locator(`[data-screen-kind="event-notes"][data-event-id="${OPEN_EVENT}"]`);
  await expect(notes.locator(".event-notes-empty")).toContainText("עוד אין פתקים משותפים");

  const portrait = testInfo.project.name === "ipad-webkit"
    ? { width: 768, height: 1024 } : { width: 390, height: 844 };
  const landscape = testInfo.project.name === "ipad-webkit"
    ? { width: 1194, height: 834 } : { width: 844, height: 390 };
  await page.setViewportSize(landscape);
  await assertNoHorizontalOverflow(page, "empty notes landscape");
  await page.setViewportSize(portrait);
  await assertTappable(page, notes.locator('[data-action="new-event-note"]'), "new note");
  await notes.locator('[data-action="new-event-note"]').click();
  const modal = page.locator(".event-note-modal");
  await expect(modal).toBeVisible();
  await modal.locator('[data-action="save-event-note"]').click();
  await expect(modal).toContainText("צריך לכתוב כותרת או תוכן");
  await assertNoHorizontalOverflow(page, "validation error");
  await modal.locator('[data-action="event-note-title"]').fill(TITLE);
  await modal.locator('[data-action="event-note-body"]').fill(BODY);
  await modal.locator('[data-action="toggle-event-note-pin"]').click();
  await expect(modal.locator('[data-action="toggle-event-note-pin"]')).toHaveAttribute("aria-pressed", "true");
  await assertTappable(page, modal.locator('[data-action="save-event-note"]'), "save note");
  await modal.locator('[data-action="save-event-note"]').click();
  await expect(modal).toHaveCount(0);
  await expect(notes.locator(".event-note-open")).toContainText(TITLE);
  await expect(notes.locator(".event-note-row.is-pinned")).toHaveCount(1);
  await expect.poll(() => page.evaluate(eventId => {
    const current = JSON.parse(localStorage.getItem("settle-friends-state"));
    return current.events.find(event => event.id === eventId).notes?.map(note => ({
      title: note.title, body: note.body, pinned: note.pinned
    }));
  }, OPEN_EVENT), { message: "the acknowledged note save must reach the final local write" })
    .toEqual([{ title: TITLE, body: BODY, pinned: true }]);
  await assertNoHorizontalOverflow(page, "saved long note");

  await notes.locator(`[data-action="back-to-event"][data-event-id="${OPEN_EVENT}"]`).first().click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator(".event-note-open")).toContainText(TITLE);
  await page.reload();
  await openEvent(page, OPEN_EVENT);
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator(".event-note-open")).toContainText(TITLE);
  await page.locator(".event-note-open").click();
  await expect(page.locator('[data-action="event-note-title"]')).toHaveValue(TITLE);
  await expect(page.locator('[data-action="event-note-body"]')).toHaveValue(BODY);
  const saved = await page.evaluate(eventId => JSON.parse(localStorage.getItem("settle-friends-state"))
    .events.find(event => event.id === eventId).notes, OPEN_EVENT);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ title: TITLE, body: BODY, pinned: true });
  expect(errors).toEqual([]);
});

test("long expense note survives summary navigation, orientation and reload", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openEvent(page, OPEN_EVENT);
  const row = page.locator(`.expense-row[data-expense-id="${EXPENSE}"]`);
  await expect(row).toContainText("כרטיסי רכבת מירושלים");
  await row.scrollIntoViewIfNeeded();
  await row.locator(".expense-row-actions-menu > summary").click();
  await row.locator('[data-action="edit-expense-notes"]').click();
  const modal = page.locator(".expense-notes-modal");
  await expect(modal).toBeVisible();
  await modal.locator('[data-action="expense-notes"]').fill(EXPENSE_NOTE);
  await assertTappable(page, modal.locator('[data-action="save-expense"]'), "save expense note");
  await modal.locator('[data-action="save-expense"]').click();
  await expect(modal).toHaveCount(0);
  await row.locator('[data-action="toggle-expense-participants"]').click();
  await expect(row.locator(".expense-saved-notes")).toHaveText(EXPENSE_NOTE);
  // Compact iPhone layout hides the workspace tab and exposes the same route
  // through the settlement card; select the visible control for each layout.
  await page.locator(`[data-action="settle"][data-event-id="${OPEN_EVENT}"]:visible`).first().click();
  await expect(page.locator('[data-event-view="summary"]')).toBeVisible();
  const landscape = testInfo.project.name === "ipad-webkit"
    ? { width: 1194, height: 834 } : { width: 844, height: 390 };
  await page.setViewportSize(landscape);
  await assertNoHorizontalOverflow(page, "summary landscape");
  await page.locator(`[data-action="back-to-event"][data-event-id="${OPEN_EVENT}"]:visible`).first().click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await page.reload();
  await openEvent(page, OPEN_EVENT);
  await row.locator('[data-action="toggle-expense-participants"]').click();
  await expect(row.locator(".expense-saved-notes")).toHaveText(EXPENSE_NOTE);
  const stored = await page.evaluate(eventId => JSON.parse(localStorage.getItem("settle-friends-state"))
    .events.find(event => event.id === eventId).expenses.find(expense => expense.id === "expense-platform-coherence-train").notes, OPEN_EVENT);
  expect(stored).toBe(EXPENSE_NOTE);
  expect(errors).toEqual([]);
});

test("closed event keeps shared note readable and editing disabled", async ({ page }) => {
  await openEvent(page, CLOSED_EVENT);
  await page.locator('[data-action="open-event-notes"]').click();
  const notes = page.locator(`[data-screen-kind="event-notes"][data-event-id="${CLOSED_EVENT}"]`);
  await expect(notes.locator('[data-action="new-event-note"]')).toBeDisabled();
  await expect(notes.locator(".event-note-open")).toContainText("פרטי אירוע סגור");
  await assertNoHorizontalOverflow(page, "closed event notes");
  await notes.locator(".event-note-open").click();
  const modal = page.locator(".event-note-modal");
  await expect(modal.locator('[data-action="event-note-title"]')).toHaveAttribute("readonly", "");
  await expect(modal.locator('[data-action="event-note-body"]')).toHaveAttribute("readonly", "");
  await expect(modal.locator('[data-action="save-event-note"]')).toHaveCount(0);
  await expect(modal).toContainText("האירוע סגור");
});

test("account-pending notifications and empty friends return to the previous screen", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openEvent(page, OPEN_EVENT);
  await page.locator('[data-action="open-notifications"]:visible').first().click();
  const inbox = page.locator('[data-screen-kind="notifications"]');
  await expect(inbox).toBeVisible();
  await expect(inbox.locator(".notification-inbox-empty.is-account-pending"))
    .toContainText("ההתראות מחכות בחשבון שלך");
  await assertNoHorizontalOverflow(page, "notifications account pending");
  const landscape = testInfo.project.name === "ipad-webkit"
    ? { width: 1194, height: 834 } : { width: 844, height: 390 };
  await page.setViewportSize(landscape);
  await assertNoHorizontalOverflow(page, "notifications landscape");
  await inbox.locator('[data-action="go-back"]').click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();

  await page.locator('[data-action="home"][data-nav-destination="home"]:visible').first().click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator('[data-action="groups"][data-tab="people"]:visible').first().click();
  const friends = page.locator('[data-screen-kind="groups"]');
  await expect(friends.locator(".friends-empty-state")).toContainText("עוד אין חברים");
  await friends.locator('[data-action="friends-hub-tab"][data-tab="requests"]').click();
  await expect(friends.locator(".friends-requests-empty"))
    .toContainText("אין בקשות שממתינות עכשיו");
  await assertNoHorizontalOverflow(page, "empty friend requests");
  await friends.locator('[data-action="go-back"]').click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  expect(errors).toEqual([]);
});
