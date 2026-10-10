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

test.beforeEach(async ({ page, request, baseURL }, testInfo) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
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
  await openTypographyHome(page, { path: dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/" });
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
  await expect(notes.locator(".event-notes-empty")).toContainText("עוד אין פתקים משותפים");

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
