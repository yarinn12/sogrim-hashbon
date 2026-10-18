import measureExpenseFlowTypography from "./helpers/expenseFlowTypography.mjs";
import measureExpenseAmount from "./helpers/expenseAmountPresentation.mjs";
import measureEventActionDock from "./helpers/eventActionDock.mjs";
import measureExpenseDisclosure from "./helpers/expenseDisclosure.mjs";
import measureEventMain from "./helpers/eventMainPresentation.mjs";
import { expect, test } from "@playwright/test";
import { openTypographyHome } from "./helpers/typographyReadiness.mjs";

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
const portraitFor = project => project === "ipad-webkit"
  ? { width: 768, height: 1024 }
  : project === "reflow-200" ? { width: 320, height: 800 } : { width: 390, height: 844 };
const landscapeFor = project => project === "ipad-webkit"
  ? { width: 1194, height: 834 }
  : project === "reflow-200" ? { width: 800, height: 320 } : { width: 844, height: 390 };

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

const ROSTER_EVENT = "event-platform-coherence-desktop-roster";
const rosterParticipants = [state.participants[0], ...Array.from({ length: 15 }, (_, index) => ({
  id: `person-platform-coherence-roster-${index + 1}`,
  displayName: `משתתף מספר ${index + 1} עם שם משפחה ארוך לאירוע המשותף`,
  kind: "guest"
}))];
const rosterState = {
  ...state,
  participants: rosterParticipants,
  events: [{ ...state.events[0], id: ROSTER_EVENT,
    name: "נסיעה משפחתית ארוכה במיוחד בין ערים ומדינות עם רשימת משתתפים גדולה",
    participantIds: rosterParticipants.map(participant => participant.id),
    expenses: [], notes: [], transfers: [] }]
};

const HELD_IMAGE_READINESS_TEST = "platform home is ready while a nonessential image is still loading";
const heldImageGates = new WeakMap();
const HELD_DEFER_READINESS_TEST = "platform home is ready before an unrelated deferred script completes";
const heldDeferGates = new WeakMap();
const DELAYED_MODULE_READINESS_TEST = "home readiness starts its UI budget after the app module executes";
const delayedModuleGates = new WeakMap();

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

const LARGE_ACTION_DOCK_TEST = "long expense totals reflow without pushing or wrapping the action label";
const READ_ONLY_EVENT_COPY_TEST = "open permission-restricted events and notes never claim the event is closed";

test.beforeEach(async ({ page, request, baseURL }, testInfo) => {
  const scenarioState = structuredClone(state);
  if(testInfo.title===READ_ONLY_EVENT_COPY_TEST) {
    scenarioState.events[0].adminsCanEditOnly=true;
    scenarioState.events[0].adminIds=[PEER];
    scenarioState.events[0].createdByParticipantId=PEER;
    scenarioState.events[0].notes=[{id:'read-only-note',title:'פתק לקריאה',body:'תוכן בדיקה',
      createdByParticipantId:PEER,updatedByParticipantId:PEER,createdAt:UPDATED_AT,updatedAt:UPDATED_AT}];
  }
  if(testInfo.title === LARGE_ACTION_DOCK_TEST) {
    scenarioState.events[0].expenses[0].total=99999999;
    scenarioState.events[0].expenses[0].payers[0].amount=99999999;
  }
  await request.post("/api/reset");
  await request.put("/api/state", { data: scenarioState });
  if (testInfo.title === HELD_IMAGE_READINESS_TEST) {
    let releaseImage;
    const imageGate = new Promise(resolve => { releaseImage = resolve; });
    const gate = { releaseImage, requested: false };
    heldImageGates.set(page, gate);
    await page.route(`${baseURL}/__qa_held_nonessential_image`, async route => {
      gate.requested = true;
      await imageGate;
      await route.fulfill({ status: 200, contentType: "image/png", body: "" });
    });
    const homeOrigin = new URL(baseURL).origin;
    await page.route(url => url.origin === homeOrigin && url.pathname === "/", async route => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({ response, body: html.replace("</body>",
        '<img src="/__qa_held_nonessential_image" alt="" hidden></body>') });
    });
  }
  if (testInfo.title === HELD_DEFER_READINESS_TEST) {
    let releaseScript;
    const scriptGate = new Promise(resolve => { releaseScript = resolve; });
    const gate = { releaseScript, requested: false };
    heldDeferGates.set(page, gate);
    page.setDefaultNavigationTimeout(5_000);
    await page.addInitScript(() => {
      window.__qaDomContentLoaded = false;
      document.addEventListener("DOMContentLoaded", () => { window.__qaDomContentLoaded = true; }, { once: true });
    });
    await page.route(`${baseURL}/__qa_held_nonessential_defer.js`, async route => {
      gate.requested = true;
      await scriptGate;
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    });
    const homeOrigin = new URL(baseURL).origin;
    await page.route(url => url.origin === homeOrigin && url.pathname === "/", async route => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({ response, body: html.replace("</body>",
        '<script defer src="/__qa_held_nonessential_defer.js"></script></body>') });
    });
  }
  if (testInfo.title === DELAYED_MODULE_READINESS_TEST) {
    const gate = { requested: false };
    delayedModuleGates.set(page, gate);
    await page.route('**/src/app.mjs?*', async route => {
      gate.requested = true;
      await new Promise(resolve => setTimeout(resolve, 4_500));
      await route.continue();
    });
  }
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
  }, { state: scenarioState, owner: OWNER, injectNoteWriteFailure: process.env.PLATFORM_COHERENCE_FAULT === "drop-note-write" });
  const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
  await openTypographyHome(page, {
    path: dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/",
    readyTimeoutMs: testInfo.title === DELAYED_MODULE_READINESS_TEST ? 4_000 : 8_000
  });
});

test(HELD_IMAGE_READINESS_TEST, async ({ page }) => {
  const gate = heldImageGates.get(page);
  try {
    expect(gate?.requested, "the document actually requested the held image").toBe(true);
    expect(await page.evaluate(() => document.readyState)).toBe("interactive");
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  } finally {
    gate?.releaseImage();
  }
});

test("empty note, validation, long pinned save, return and reload remain coherent", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openEvent(page, OPEN_EVENT);
  await page.locator('[data-action="open-event-notes"]').click();
  const notes = page.locator(`[data-screen-kind="event-notes"][data-event-id="${OPEN_EVENT}"]`);
  // The account upgrade intentionally removed the redundant empty-state copy.
  // Keep the empty-list and complete create/save/reload checks below.
  await expect(notes).toBeVisible();
  await expect(notes.locator(".event-notes-empty")).toHaveCount(0);
  await expect(notes.locator(".event-note-row")).toHaveCount(0);

  await page.setViewportSize(landscapeFor(testInfo.project.name));
  await assertNoHorizontalOverflow(page, "empty notes landscape");
  await page.setViewportSize(portraitFor(testInfo.project.name));
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
  // The balance card is the summary route on every layout. Selecting the
  // first generic settle button can latch onto a workspace tab that becomes
  // hidden after the note panel expands on a compact screen.
  const summaryCard = page.locator(`.event-personal-balance[data-action="settle"][data-event-id="${OPEN_EVENT}"]`);
  await assertTappable(page, summaryCard, "summary balance card");
  await summaryCard.click();
  await expect(page.locator('[data-event-view="summary"]')).toBeVisible();
  await page.setViewportSize(landscapeFor(testInfo.project.name));
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
  await page.setViewportSize(landscapeFor(testInfo.project.name));
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

test("desktop 32px roster exposes the last participant and add action above navigation", async ({ page, request, browserName }, testInfo) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: rosterState });
  await page.evaluate(next => localStorage.setItem("settle-friends-state", JSON.stringify(next)), rosterState);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTypographyHome(page, { path: "/?dynamic-type-preview=32" });
  await expect(page.locator("html")).toHaveCSS("font-size", "32px");
  await openEvent(page, ROSTER_EVENT);
  await page.locator('[data-action="open-event-participants"]:visible').first().click();
  const roster = page.locator(".event-participant-roster-modal");
  await expect(roster).toBeVisible();
  await expect(roster.locator(".event-participant-roster-row"))
    .toHaveCount(rosterParticipants.length);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter(animation => animation.playState === "running" &&
      Number.isFinite(animation.effect?.getComputedTiming().endTime)).length)).toBe(0);
  // The route also has JS-driven entrance motion, outside getAnimations().
  await page.waitForTimeout(350);
  const geometry = await roster.evaluate(node => {
    const panel = node.getBoundingClientRect();
    const nav = [...document.querySelectorAll(".product-app-nav")]
      .map(element => element.getBoundingClientRect())
      .find(rect => rect.width > 0 && rect.height > 0);
    return { panelBottom: panel.bottom, navTop: nav?.top ?? null,
      gap: nav ? nav.top - panel.bottom : null,
      overflowY: getComputedStyle(node).overflowY,
      scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
  });
  await testInfo.attach("desktop-roster-32px-geometry", {
    contentType: "application/json", body: JSON.stringify(geometry)
  });
  console.log(JSON.stringify({ kind: "desktop-roster-32px-geometry",
    project: testInfo.project.name, browserName, ...geometry }));
  expect(geometry.navTop, "desktop navigation must be measurable").not.toBeNull();
  expect(geometry.gap, "navigation must not cover the roster").toBeGreaterThanOrEqual(-1);
  expect(geometry.overflowY, "roster must own user scrolling").toBe("auto");
  expect(geometry.scrollHeight, "roster must contain more rows than fit at once")
    .toBeGreaterThan(geometry.clientHeight);

  // Mobile WebKit has no Playwright wheel input; desktop WebKit, Chromium and
  // Firefox still verify real pointer-wheel scrolling in this regression.
  if (browserName !== "webkit" || /desktop/i.test(testInfo.project.name)) {
    const box = await roster.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 550);
    await expect.poll(() => roster.evaluate(node => node.scrollTop), {
      message: "wheel input must move the real roster scroller"
    }).toBeGreaterThan(0);
  }
  const last = roster.locator(".event-participant-roster-row").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await assertTappable(page, last, "last participant");
  await last.click();
  await expect(page.locator(".event-participant-management-modal")).toBeVisible();
  await page.goBack();
  await expect(roster).toBeVisible();
  const add = roster.locator('[data-action="open-event-participant-add"]');
  await add.scrollIntoViewIfNeeded();
  await assertTappable(page, add, "add participant");
  await add.click();
  await expect(page.locator(".event-participant-add-route-modal")).toBeVisible();
});

test(HELD_DEFER_READINESS_TEST, async ({ page }) => {
  const gate = heldDeferGates.get(page);
  try {
    expect(gate?.requested, "the document actually requested the deferred script").toBe(true);
    expect(await page.evaluate(() => document.readyState)).toBe("interactive");
    expect(await page.evaluate(() => window.__qaDomContentLoaded)).toBe(false);
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  } finally {
    gate?.releaseScript();
  }
  await page.waitForLoadState("domcontentloaded");
  expect(await page.evaluate(() => window.__qaDomContentLoaded)).toBe(true);
});

test(DELAYED_MODULE_READINESS_TEST, async ({ page }) => {
  expect(delayedModuleGates.get(page)?.requested, "the app module was actually held").toBe(true);
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  const marks = await page.evaluate(() => Object.fromEntries(
    performance.getEntriesByType("mark")
      .filter(entry => entry.name.startsWith("sogrim:start:"))
      .map(entry => [entry.name.slice("sogrim:start:".length), entry.startTime])
  ));
  expect(marks["app-module-ready"], "the module milestone follows the controlled delay").toBeGreaterThan(4_000);
  expect(marks["first-screen-rendered"]).toBeGreaterThanOrEqual(marks["app-module-ready"]);
});

async function openNoteEditorForDelayedHistory(page, request) {
  const note = {
    id: "note-platform-coherence-history-race", title: "פרטי נסיעה שנשמרו",
    body: "הפתק חייב להישאר גם אחרי ניווט וחזרת היסטוריה מאוחרת.", pinned: true,
    createdByParticipantId: OWNER, updatedByParticipantId: OWNER,
    createdAt: UPDATED_AT, updatedAt: UPDATED_AT
  };
  const noteState = { ...state, events: state.events.map(event => event.id === OPEN_EVENT
    ? { ...event, notes: [note] } : event) };
  await request.put("/api/state", { data: noteState });
  await page.evaluate(next => localStorage.setItem("settle-friends-state", JSON.stringify(next)), noteState);
  await openTypographyHome(page);
  await openEvent(page, OPEN_EVENT);
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator(`[data-screen-kind="event-notes"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await page.locator('.event-note-open').click();
  await expect(page.locator('.event-note-modal')).toBeVisible();
  return note;
}

async function holdActualDialogHistoryTraversal(page) {
  await page.evaluate(() => {
    const realBack = history.back.bind(history);
    const realGo = history.go.bind(history);
    const realPush = history.pushState.bind(history);
    let pending = null;
    let heldDialogBack = false;
    window.__qaDialogHistory = { popstates: [], get pending() { return pending; } };
    window.addEventListener('popstate', event => {
      window.__qaDialogHistory.popstates.push({ depth: event.state?.depth,
        screen: event.state?.view?.screen?.name });
    }, true);
    history.back = function() {
      // Hold only the dialog close. Later user Back actions must remain real.
      if (heldDialogBack) return realBack();
      heldDialogBack = true;
      pending = { pushes: 0, distance: 1, targetDepth: Number(history.state?.depth) - 1 };
    };
    history.pushState = function(...args) {
      if (pending) pending.pushes += 1;
      return realPush(...args);
    };
    history.go = function(steps) {
      if (steps < 0 && !heldDialogBack) {
        heldDialogBack = true;
        pending = { pushes: 0, distance: -steps,
          targetDepth: Number(history.state?.depth) + steps };
        return;
      }
      return realGo(steps);
    };
    window.__qaReleaseDialogHistory = () => {
      if (!pending) throw new Error('Dialog history rewind was not requested');
      const steps = pending.pushes + pending.distance;
      pending = null;
      return realGo(-steps);
    };
    window.__qaReleaseHeldCall = () => {
      if (!pending) throw new Error('Dialog history rewind was not requested');
      const distance = pending.distance;
      pending = null;
      return distance === 1 ? realBack() : realGo(-distance);
    };
  });
}

async function closeNoteEditorWithHeldHistory(page) {
  await holdActualDialogHistoryTraversal(page);
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
  const pending = await page.evaluate(() => window.__qaDialogHistory.pending);
  expect(pending?.targetDepth, 'closing the note must request a real browser-history rewind')
    .toBeGreaterThanOrEqual(0);
  return pending;
}

test('late note-dialog popstate cannot replace newer profile, home and event navigation', async ({ page, request }, testInfo) => {
  const note = await openNoteEditorForDelayedHistory(page, request);
  const pending = await closeNoteEditorWithHeldHistory(page);
  await page.locator('.product-app-identity [data-action="edit-profile"]').first().click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.locator('[data-nav-destination="home"]').first().click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${OPEN_EVENT}"]`).first().click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  const beforeRelease = await page.evaluate(() => ({ depth: history.state?.depth,
    screen: history.state?.view?.screen?.name, pushes: window.__qaDialogHistory.pending?.pushes }));
  expect(beforeRelease.screen).toBe('event');
  expect(beforeRelease.pushes).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__qaReleaseDialogHistory());
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBeGreaterThanOrEqual(1);
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state?.view?.screen?.name)).toBe('event');
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
  const savedNote = await page.evaluate(eventId => JSON.parse(localStorage.getItem('settle-friends-state'))
    .events.find(event => event.id === eventId).notes[0], OPEN_EVENT);
  expect(savedNote).toMatchObject({ id: note.id, body: note.body });
  await testInfo.attach('delayed-actual-popstate', { contentType: 'application/json',
    body: JSON.stringify({ pending, beforeRelease,
      after: await page.evaluate(() => ({ state: history.state,
        popstates: window.__qaDialogHistory.popstates })) }) });
  await page.evaluate(() => history.back());
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
});

test('note-dialog history rewind without newer navigation returns to notes', async ({ page, request }) => {
  const note = await openNoteEditorForDelayedHistory(page, request);
  const pending = await closeNoteEditorWithHeldHistory(page);
  expect(pending.pushes).toBe(0);
  await page.evaluate(() => window.__qaReleaseDialogHistory());
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBe(1);
  await expect(page.locator(`[data-screen-kind="event-notes"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state?.view?.screen?.name)).toBe('event-notes');
  const savedNote = await page.evaluate(eventId => JSON.parse(localStorage.getItem('settle-friends-state'))
    .events.find(event => event.id === eventId).notes[0], OPEN_EVENT);
  expect(savedNote).toMatchObject({ id: note.id, body: note.body });
  await page.locator('.product-app-identity [data-action="edit-profile"]').first().click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator(`[data-screen-kind="event-notes"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
});

test('new navigation after late dialog-history replay keeps its own Back destination', async ({ page, request }) => {
  await openNoteEditorForDelayedHistory(page, request);
  await closeNoteEditorWithHeldHistory(page);
  await page.locator('.product-app-identity [data-action="edit-profile"]').first().click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.evaluate(() => window.__qaReleaseDialogHistory());
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.locator('[data-nav-destination="home"]').first().click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
});

test('draft typed while dialog-history rewind waits survives replay, next route and Back', async ({ page, request }) => {
  await openNoteEditorForDelayedHistory(page, request);
  await closeNoteEditorWithHeldHistory(page);
  await page.locator('[data-nav-destination="home"]').first().click();
  await page.locator('[data-action="new-event"]').first().click();
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  await expect(page.locator('[data-screen-kind="new-event"]')).toBeVisible();
  const name = 'טיוטת אירוע שנכתבה בזמן התאוששות הניווט';
  await page.locator('[data-action="new-event-name"]').fill(name);
  await expect.poll(() => page.evaluate(() => history.state?.view?.newEventDraft?.name)).toBe(name);
  await page.evaluate(() => window.__qaReleaseDialogHistory());
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-action="new-event-name"]')).toHaveValue(name);
  await expect.poll(() => page.evaluate(() => history.state?.view?.newEventDraft?.name)).toBe(name);
  await page.locator('[data-action="open-new-event-settlement"]').click();
  await expect(page.locator('[data-screen-kind="new-event"][data-event-creation-step="settlement"]')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('[data-screen-kind="new-event"][data-event-creation-step="details"]')).toBeVisible();
  await expect(page.locator('[data-action="new-event-name"]')).toHaveValue(name);
  await expect.poll(() => page.evaluate(() => history.state?.view?.newEventDraft?.name)).toBe(name);
});

test('late multi-step expense-save rewind returns to the latest route and preserves Back', async ({ page }) => {
  await openEvent(page, OPEN_EVENT);
  await page.locator(`[data-action="show-expense-form"][data-event-id="${OPEN_EVENT}"]`).first().click();
  const expenseDialog = page.locator('.expense-step-modal');
  await expect(expenseDialog).toHaveAttribute('data-expense-step', 'amount');
  await expenseDialog.locator('[data-action="expense-total"]').fill('120');
  await expenseDialog.locator('[data-action="expense-step-next"]').click();
  await expect(expenseDialog).toHaveAttribute('data-expense-step', 'name');
  await expenseDialog.locator('[data-action="expense-name"]').fill('נסיעה שנשמרה לפני החזרה המאוחרת');
  for (let step = 0; step < 4 && !(await expenseDialog.locator('[data-action="save-expense"]').isVisible()); step++) {
    await expenseDialog.locator('[data-action="expense-step-next"]').click();
  }
  await expect(expenseDialog.locator('[data-action="save-expense"]')).toBeVisible();
  await holdActualDialogHistoryTraversal(page);
  await expenseDialog.locator('[data-action="save-expense"]').click();
  await expect(expenseDialog).toHaveCount(0);
  const pending = await page.evaluate(() => window.__qaDialogHistory.pending);
  expect(pending.distance, 'saving a multi-step expense must rewind multiple entries').toBeGreaterThan(1);
  const savedExpense = await page.evaluate(eventId => JSON.parse(localStorage.getItem('settle-friends-state'))
    .events.find(event => event.id === eventId).expenses.find(expense =>
      expense.name === 'נסיעה שנשמרה לפני החזרה המאוחרת'), OPEN_EVENT);
  expect(savedExpense?.name).toBe('נסיעה שנשמרה לפני החזרה המאוחרת');
  await page.locator('.product-app-identity [data-action="edit-profile"]').first().click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.evaluate(() => window.__qaReleaseDialogHistory());
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state?.view?.screen?.name)).toBe('profile');
  await page.evaluate(() => history.back());
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await expect(page.locator('.expense-modal')).toHaveCount(0);
  await expect(page.locator('.expense-row').filter({ hasText: 'נסיעה שנשמרה לפני החזרה המאוחרת' })).toHaveCount(1);
  await page.evaluate(() => history.back());
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.reload();
  await openEvent(page, OPEN_EVENT);
  await expect(page.locator('.expense-row').filter({ hasText: 'נסיעה שנשמרה לפני החזרה המאוחרת' })).toHaveCount(1);
});

test('two note-editor closes before the first Back settles never reopen either editor', async ({ page, request }) => {
  const note = await openNoteEditorForDelayedHistory(page, request);
  await closeNoteEditorWithHeldHistory(page);
  await page.locator('.event-note-open').click();
  await expect(page.locator('.event-note-modal')).toBeVisible();
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
  await page.locator('.product-app-identity [data-action="edit-profile"]').first().click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.evaluate(() => window.__qaReleaseHeldCall());
  await expect.poll(() => page.evaluate(() => window.__qaDialogHistory.popstates.length)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state?.view?.eventDialog ?? null)).toBeNull();
  const savedNote = await page.evaluate(eventId => JSON.parse(localStorage.getItem('settle-friends-state'))
    .events.find(event => event.id === eventId).notes[0], OPEN_EVENT);
  expect(savedNote).toMatchObject({ id: note.id, body: note.body });
  await page.evaluate(() => history.back());
  await expect(page.locator(`[data-screen-kind="event-notes"][data-event-id="${OPEN_EVENT}"]`)).toBeVisible();
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
});

// These assertions cover the rendered failure, including the actual numeric
// glyphs. Growing only the card wrapper must not satisfy text enlargement.
test("event balance and expense total stay explained, aligned and scalable", async ({ page }) => {
  for (const enlarged of [false, true]) {
    await openTypographyHome(page, { path: enlarged ? "/?dynamic-type-preview=32" : "/" });
    if (enlarged) await expect(page.locator("html")).toHaveCSS("font-size", "32px");
    await openEvent(page, OPEN_EVENT);
    for (const width of [320, 393, 411]) {
      await page.setViewportSize({ width, height: 852 });
      await page.evaluate(() => document.fonts.ready);
      const result=await page.evaluate(measureEventMain);
      const context=width+"px/"+result.rootFont;
      const dock=await page.evaluate(measureEventActionDock);
      for(const field of ['totalLeft','totalGlyphsFit','captionAbove','buttonFits','groupsSeparate','buttonAtRight','noOverflow']) {
        expect(dock[field],context+' action dock '+field).toBe(true);
      }
      expect(dock.labelLines,context+' action label').toBe(1);
      expect(Math.abs(dock.visibleGroupDeltaX),context+' visible icon/text center').toBeLessThanOrEqual(1.5);
      expect(Math.abs(dock.iconTextDeltaY),context+' icon aligned with glyphs').toBeLessThanOrEqual(1.5);
      expect(result.caption,context).toBe("סה״כ הוצאות");
      for(const field of ["captionVisible","captionFits","totalFits","balanceCopyFits",
        "balanceNumberFits","groupsDoNotOverlap","summaryAboveAmount","ctaFits",
        "navOriginalOrder","noHorizontalOverflow"]) expect(result[field],context+" "+field).toBe(true);
      expect(Math.abs(result.arrowDelta),context+" chevron centered with text").toBeLessThanOrEqual(1.5);
      const font=Number.parseFloat(result.rootFont);
      for(const [field,ratio] of [["captionFont",.8125],["totalFont",1.125],
        ["balanceLabelFont",.875],["balanceDetailFont",.6875],["balanceNumberFont",1.25]]) {
        expect(Number.parseFloat(result[field]),context+" actual "+field).toBeCloseTo(font*ratio,1);
      }
      expect(result.dots.length).toBeGreaterThan(0);
      for(const dots of result.dots) {
        expect(Math.abs(dots.dx),context).toBeLessThanOrEqual(1);
        expect(Math.abs(dots.dy),context).toBeLessThanOrEqual(1);
        expect(dots.width).toBeGreaterThanOrEqual(43.99);
        expect(dots.height).toBeGreaterThanOrEqual(43.99);
      }
    }
    await assertTappable(page,page.locator(".event-personal-balance"),"balance summary");
    await page.locator(".event-personal-balance").click();
    await expect(page.locator('[data-event-view="summary"]')).toBeVisible();
    await page.locator('[data-action="back-to-event"]:visible').first().click();
    await expect(page.locator(".event-action-total")).toContainText("סה״כ הוצאות");
    const totalBefore=await page.locator('.event-action-total').innerText();
    await page.locator('.event-action-dock [data-action="show-expense-form"]').click();
    await expect(page.locator('.expense-modal')).toBeVisible();
    await page.getByRole('button',{name:'חזרה לאירוע',exact:true}).click();
    await expect(page.locator('.expense-modal')).toHaveCount(0);
    await expect(page.locator('.event-action-total')).toHaveText(totalBefore);
  }
});


test("expense disclosure cue and command labels fit at normal and enlarged sizes", async ({ page }) => {
  for(const enlarged of [false,true]) {
    await openTypographyHome(page,{path:enlarged ? '/?dynamic-type-preview=32' : '/'});
    await openEvent(page,OPEN_EVENT);
    const row=page.locator(`.expense-row[data-expense-id="${EXPENSE}"]`);
    const trigger=row.locator('.expense-row-main');
    const menuTrigger=row.locator('.expense-row-actions-menu > summary');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded','true');
    await expect(row.locator('.expense-participants-list-title')).toHaveText('מתחלקים בהוצאה');
    for(const width of [320,393,411]) {
      await page.setViewportSize({width,height:852});
      await page.evaluate(()=>document.fonts.ready);
      await menuTrigger.click();
      await expect(row.locator('.expense-row-actions-menu')).toHaveAttribute('open','');
      const result=await page.evaluate(measureExpenseDisclosure);
      const context=width+'px/'+result.rootFont;
      expect(result.noHorizontalOverflow,context).toBe(true);
      for(const item of result.rows) {
        for(const field of ['titleFits','iconPresent','iconInsideMain'])expect(item[field],context+' '+field).toBe(true);
        expect(item.titleIconGap,context).toBeGreaterThanOrEqual(5.9);
        expect(item.caption).toBe('מתחלקים בהוצאה');
        expect(Math.abs(item.dots.dx),context).toBeLessThanOrEqual(1);
        expect(Math.abs(item.dots.dy),context).toBeLessThanOrEqual(1);
        expect(item.dots.width,context).toBeGreaterThanOrEqual(43.99);
        expect(item.dots.height,context).toBeGreaterThanOrEqual(43.99);
      }
      expect(result.menus).toHaveLength(1);
      const menu=result.menus[0];
      expect(menu.insideViewport,context).toBe(true);
      expect(menu.aboveNavigation,context).toBe(true);
      if(enlarged)expect(menu.width,context).toBeGreaterThan(166);
      else expect(menu.width,context).toBeCloseTo(166,0);
      for(const button of menu.buttons) {
        expect(button.glyphsFit,context+' '+button.text).toBe(true);
        expect(button.lines,context+' '+button.text).toBe(1);
        expect(button.height,context).toBeGreaterThanOrEqual(43.99);
        if(enlarged)expect(Number.parseFloat(button.font),context).toBeGreaterThanOrEqual(27);
      }
      await menuTrigger.press('Escape');
      await expect(row.locator('.expense-row-actions-menu')).not.toHaveAttribute('open','');
    }
    const opened=await page.evaluate(measureExpenseDisclosure);
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded','false');
    await expect(row.locator('.expense-row-expand-icon')).not.toHaveCSS('transform',opened.rows[0].iconTransform);
    const closed=await page.evaluate(measureExpenseDisclosure);
    expect(closed.rows[0].expanded).toBe(false);
    expect(closed.rows[0].iconTransform).not.toBe(opened.rows[0].iconTransform);
    await expect(row.locator('.expense-participants-details')).not.toHaveAttribute('open','');
  }
});


test(LARGE_ACTION_DOCK_TEST, async ({page})=>{
  for(const enlarged of [false,true]) {
    await openTypographyHome(page,{path:enlarged?'/?dynamic-type-preview=32':'/'});
    await openEvent(page,OPEN_EVENT);
    await expect(page.locator('.event-action-total .font-num')).toHaveText('₪999,999.99');
    for(const width of [320,393,411]) {
      await page.setViewportSize({width,height:852});
      await page.evaluate(()=>document.fonts.ready);
      const dock=await page.evaluate(measureEventActionDock);
      const context=width+'px/'+dock.root;
      for(const field of ['totalLeft','totalGlyphsFit','captionAbove','buttonFits','groupsSeparate','buttonAtRight','noOverflow']) {
        expect(dock[field],context+' '+field).toBe(true);
      }
      expect(dock.labelLines,context).toBe(1);
    }
  }
});


test("expense amount scales actual leaf fonts and retains a usable currency group", async ({page}) => {
  for(const root of [16,20,32]) {
    await openTypographyHome(page,{path:root===16?'/':`/?dynamic-type-preview=${root}`});
    await openEvent(page,OPEN_EVENT);
    await page.getByRole('button',{name:'הוסף הוצאה',exact:true}).click();
    const dialog=page.locator('.expense-step-modal[data-expense-step="amount"]');
    await expect(dialog).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    for(const width of [320,393,411]) {
      await page.setViewportSize({width,height:852});
      const result=await page.evaluate(measureExpenseAmount);
      const context=`${width}px/root${root}`;
      expect(result.width,context).toBe(width);
      expect(result.root,context).toBe(root);
      expect(result.inputFont,context+': amount must enlarge, not reset to1rem').toBeCloseTo(root*2.375,1);
      expect(result.placeholderFont,context+': empty-field digits must enlarge too').toBeCloseTo(root*2.375,1);
      expect(result.labelFont,context+': amount label must enlarge').toBeCloseTo(root*.8125,1);
      expect(result.currencyLabelFont,context+': currency label must enlarge').toBeCloseTo(root*.8125,1);
      expect(result.currencyValueFont,context+': currency value must enlarge').toBeCloseTo(root*.875,1);
      expect(result.captionBackground,context).toBe('rgba(0, 0, 0, 0)');
      for(const key of ['labelGlyphsFit','currencyLabelGlyphsFit','currencyValueGlyphsFit','nextGlyphsFit',
        'noHorizontalOverflow','modalFits','symmetricFieldInsets','amountThenCurrency','nextAboveNav','fieldAlignedWithCurrency','nextCenterHits']) {
        expect(result[key],context+': '+key).toBe(true);
      }
      expect(result.currencyGap,context).toBeGreaterThanOrEqual(8);
      expect(result.currencyGap,context).toBeLessThanOrEqual(20);
      expect(result.next.height,context).toBeGreaterThanOrEqual(44);
      expect(result.trigger.height,context).toBeGreaterThanOrEqual(44);
      await dialog.getByLabel('מטבע ההוצאה',{exact:true}).scrollIntoViewIfNeeded();
      expect((await page.evaluate(measureExpenseAmount)).currencyCenterHits,context+': currency reachable after scroll').toBe(true);
    }
    if(root===32) {
      await page.setViewportSize({width:844,height:390});
      await expect(dialog.locator('.eyebrow')).toBeHidden();
      expect((await page.evaluate(measureExpenseAmount)).modalFits,'short landscape panel stays in viewport').toBe(true);
      await assertTappable(page,dialog.getByRole('textbox',{name:'סכום כולל ₪',exact:true}),'short landscape amount');
      await assertTappable(page,dialog.getByLabel('מטבע ההוצאה',{exact:true}),'short landscape currency');
      await assertTappable(page,dialog.getByRole('button',{name:'המשך לשם ההוצאה',exact:true}),'short landscape next');
      await page.setViewportSize({width:411,height:852});
    }
    await dialog.getByRole('button',{name:'המשך לשם ההוצאה',exact:true}).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('יש להזין סכום גדול מאפס.',{exact:true})).toBeVisible();
    await dialog.getByRole('textbox',{name:'סכום כולל ₪',exact:true}).fill('123.45');
    await dialog.getByRole('button',{name:'המשך לשם ההוצאה',exact:true}).click();
    await expect(page.locator('.expense-step-modal[data-expense-step="name"]')).toBeVisible();
    await page.getByRole('button',{name:'חזרה לשלב הקודם',exact:true}).click();
    await expect(dialog.getByRole('textbox',{name:'סכום כולל ₪',exact:true})).toHaveValue('123.45');
    await dialog.getByRole('button',{name:'חזרה לאירוע',exact:true}).click();
    await expect(page.locator('.expense-row')).toHaveCount(1);
  }
});


test("participant checkbox and avatar select the expense share without opening statistics", async ({page})=>{
  await openTypographyHome(page);
  await openEvent(page,OPEN_EVENT);
  await page.getByRole('button',{name:'הוסף הוצאה',exact:true}).click();
  const dialog=page.locator('.expense-step-modal');
  await dialog.locator('[data-action="expense-total"]').fill('90.01');
  await dialog.locator('[data-action="expense-step-next"]').click();
  await dialog.locator('[data-action="expense-name"]').fill('בדיקת בחירת משתתפים');
  await dialog.locator('[data-action="expense-step-next"]').click();
  await dialog.locator('[data-action="expense-step-next"]').click();
  await expect(dialog).toHaveAttribute('data-expense-step','participants');
  const input=dialog.locator(`[data-action="expense-shared"][data-participant-id="${PEER}"]`);
  const row=dialog.locator(`.expense-participant-row:has([data-action="expense-shared"][data-participant-id="${PEER}"])`);
  await input.uncheck();
  await expect(input).not.toBeChecked();
  await expect(dialog).toHaveAttribute('data-expense-step','participants');
  await expect(page.locator('[data-screen-kind="friend-profile"]')).toHaveCount(0);
  await row.locator('.avatar').click();
  await expect(input).toBeChecked();
  await expect(dialog).toHaveAttribute('data-expense-step','participants');
  await expect(row.locator('[role="button"]')).toHaveCount(0);
  await input.focus();
  await page.keyboard.press('Space');
  await expect(input).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(input).toBeChecked();
});


test(READ_ONLY_EVENT_COPY_TEST,async({page})=>{
  await openTypographyHome(page);
  await openEvent(page,OPEN_EVENT);
  const dock=page.locator('.event-action-dock');
  await expect(dock.getByRole('button',{name:'קריאה בלבד',exact:true})).toBeDisabled();
  await expect(dock).not.toContainText('האירוע סגור');
  await page.getByRole('button',{name:'פתיחת פתקים משותפים',exact:true}).click();
  await expect(page.locator('[data-screen-kind="event-notes"]').getByRole('button',{name:'קריאה בלבד',exact:true})).toBeDisabled();
  await page.locator('[data-action="open-event-note"][data-note-id="read-only-note"]').click();
  await expect(page.locator('.event-note-modal')).toContainText('אין לך הרשאה לערוך פתק זה. אפשר לקרוא את התוכן.');
  await expect(page.locator('.event-note-modal')).not.toContainText('האירוע סגור');
  await expect(page.locator('.event-note-modal [data-action="save-event-note"]')).toHaveCount(0);
});


test("all expense step captions names and review values grow with system text",async({page})=>{
 for(const root of [16,20,32]) {
  await openTypographyHome(page,{path:root===16?'/':`/?dynamic-type-preview=${root}`});
  await openEvent(page,OPEN_EVENT);
  await page.getByRole('button',{name:'הוסף הוצאה',exact:true}).click();
  const dialog=page.locator('.expense-step-modal');
  for(const step of ['amount','name','payer','participants','review']) {
   await expect(dialog).toHaveAttribute('data-expense-step',step);
   await page.evaluate(()=>document.fonts.ready);
   for(const width of [320,393,411]) {
    await page.setViewportSize({width,height:852});
    const result=await page.evaluate(measureExpenseFlowTypography);
    const context=`${step}/${root}/${width}`;
    expect(result.root,context).toBe(root);
    expect(result.width,context).toBe(width);
    expect(result.modalFits,context).toBe(true);
    expect(result.noHorizontalOverflow,context).toBe(true);
    expect(result.leaves.length,context).toBeGreaterThan(0);
    for(const leaf of result.leaves) {
     expect(leaf.font,context+': '+leaf.text).toBeCloseTo(root*leaf.ratio,1);
     expect(leaf.fits,context+': glyph bounds '+leaf.text).toBe(true);
    }
   }
   if(step==='amount')await dialog.locator('[data-action="expense-total"]').fill('12.34');
   if(step==='name')await dialog.locator('[data-action="expense-name"]').fill('בדיקת גופן בכל השלבים');
   if(step!=='review')await dialog.locator('[data-action="expense-step-next"]').click();
  }
  await page.getByRole('button',{name:'בית',exact:true}).click();
 }
});
