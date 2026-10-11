import { expect, test } from "@playwright/test";
import { personalPinsCloud } from "./helpers/personalPinsCloud.mjs";
import { readLocalQaState } from "./helpers/readLocalQaState.mjs";

test.use({ serviceWorkers: "block" });
const OWNER = "person-event-pins-owner";
const FRIEND = "person-event-pins-friend";
const NEW = "event-pins-new", OLD = "event-pins-old", CLOSED = "event-pins-closed";
const KEY = `settle-friends-personal-event-pins-v1:${OWNER}`;
const state = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: "בודק נעיצות", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND, displayName: "חבר לבדיקה", kind: "user", avatarPreset: "avatar-2" }
  ],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [NEW, OLD, CLOSED].map((id, index) => ({
    id, name: ["האירוע החדש", "אירוע עם שם ארוך במיוחד לבדיקת הסיכה והצגת כותרות בעברית באייפון", "אירוע סגור"][index],
    eventType: "outing", currency: "ILS", participantIds: [OWNER, FRIEND],
    adminIds: [OWNER], createdByParticipantId: OWNER,
    createdAt: `2026-09-0${3 - index}T08:00:00.000Z`,
    updatedAt: `2026-09-0${3 - index}T08:00:00.000Z`,
    ...(id === CLOSED ? { closedAt: "2026-09-04T08:00:00.000Z", closedByParticipantId: OWNER } : {}),
    expenses: [], transfers: [], transferStatusUpdates: [], activityLog: [],
    notes: [{ id: `note-${id}`, title: "פתק מוצמד לבדיקה", body: "התוכן נשמר", pinned: true,
      createdByParticipantId: OWNER, updatedByParticipantId: OWNER,
      createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" }]
  }))
};

async function seed(page, participantId = OWNER) {
  await page.addInitScript(({ state, participantId }) => {
    // Seed once per browser context: reload must exercise the real saved preference.
    if (!localStorage.getItem("qa-event-pins-seeded")) {
      localStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify({ ...state, currentParticipantId: participantId }));
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId, displayName: participantId === state.currentParticipantId ? "בודק נעיצות" : "חבר לבדיקה", avatarPreset: "avatar-1"
      }));
      localStorage.setItem("settle-friends-current-participant", participantId);
      localStorage.setItem("qa-event-pins-seeded", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state, participantId });
  const dynamicType = Number(test.info().project.metadata?.dynamicTypePreview || 0);
  await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/");
  await expect(page.locator(".event-row")).toHaveCount(3);
}

const rows = page => page.locator(".event-list .event-row");
const row = (page, id) => page.locator(`.event-row[data-event-id="${id}"]`);
const pinButton = page => page.locator('[data-action="toggle-personal-event-pin"]');
async function order(page, ids) {
  await expect.poll(() => rows(page).evaluateAll(elements => elements.map(element => element.dataset.eventId))).toEqual(ids);
}
async function menu(page, id) {
  await row(page, id).locator('[data-action="event-status-select"]').click();
  await expect(page.locator(".event-status-menu")).toBeVisible();
}
async function pin(page, id, pinned) {
  await menu(page, id);
  await expect(pinButton(page)).toHaveAttribute("aria-pressed", String(!pinned));
  await pinButton(page).click();
  await expect(page.locator(".event-status-menu")).toHaveCount(0);
  await expect(row(page, id).locator('[aria-label="אירוע מוצמד"]')).toHaveCount(pinned ? 1 : 0);
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
});

test("pin and unpin several events consecutively, preserve normal order and survive reload", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await seed(page);
  await order(page, [NEW, OLD, CLOSED]);
  const before = await (await readLocalQaState(request, test.info().project.use.baseURL)).json();
  const localEventsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events);
  for (let attempt = 0; attempt < 3; attempt++) {
    await pin(page, OLD, true);
    await order(page, [OLD, NEW, CLOSED]);
    await pin(page, CLOSED, true);
    await order(page, [OLD, CLOSED, NEW]);
    await pin(page, OLD, false);
    await order(page, [CLOSED, NEW, OLD]);
    await pin(page, CLOSED, false);
    await order(page, [NEW, OLD, CLOSED]);
  }
  await pin(page, OLD, true);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)).toEqual([OLD]);
  await page.reload();
  await order(page, [OLD, NEW, CLOSED]);
  await expect(row(page, OLD).locator(".event-note-pin")).toBeVisible();
  // Personal ordering must never modify the shared event, note pins or activity.
  expect(await (await readLocalQaState(request, test.info().project.use.baseURL)).json()).toEqual(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events)).toEqual(localEventsBefore);
  expect(errors).toEqual([]);
});

test("event pin uses the note pin design and remains usable with long Hebrew names", async ({ page }, testInfo) => {
  await seed(page);
  const presentation = locator => locator.evaluate(element => {
    const style = getComputedStyle(element), svg = element.querySelector("svg");
    return { color: style.color, background: style.backgroundColor, border: style.border,
      borderRadius: style.borderRadius, padding: style.padding, gap: style.gap,
      minHeight: style.minHeight, fontWeight: style.fontWeight,
      // Compare the design dimensions, independently of the modal's entrance
      // animation. Actual touch targets and pin/title geometry are checked below.
      icon: svg?.innerHTML, iconWidth: svg ? getComputedStyle(svg).width : "",
      iconHeight: svg ? getComputedStyle(svg).height : "" };
  });
  await row(page, OLD).locator('[data-action="open-event"]').click();
  await page.locator('[data-action="open-event-notes"]').click();
  const noteMarker = await presentation(page.locator(".event-note-pin").first());
  const noteLabel = await presentation(page.locator(".event-notes-section-label").first());
  await page.locator('[data-action="new-event-note"]').click();
  const noteButton = page.locator('[data-action="toggle-event-note-pin"]');
  const inactive = await presentation(noteButton);
  await noteButton.click();
  const active = await presentation(noteButton);
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await page.locator('.product-app-nav [data-nav-destination="home"]').click();
  await menu(page, OLD);
  expect(await presentation(pinButton(page))).toEqual(inactive);
  await pinButton(page).click();
  await expect(page.locator(".event-status-menu")).toHaveCount(0);
  expect(await presentation(row(page, OLD).locator(".event-note-pin"))).toEqual(noteMarker);
  expect(await presentation(page.locator(".event-list .event-notes-section-label"))).toEqual(noteLabel);
  await menu(page, OLD);
  expect(await presentation(pinButton(page))).toEqual(active);
  const bounds = await pinButton(page).boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await pinButton(page).click();
  await expect(page.locator(".event-status-menu")).toHaveCount(0);
  await expect(page.locator(".event-list .event-notes-section-label")).toHaveCount(0);
  await pin(page, OLD, true);
  const titleBounds = await row(page, OLD).locator(".event-row-title strong").boundingBox();
  const pinBounds = await row(page, OLD).locator(".event-note-pin").boundingBox();
  expect(pinBounds.y, "pin stays beside a long title, never on its own line").toBeLessThan(titleBounds.y + titleBounds.height);
  expect(pinBounds.x + pinBounds.width).toBeLessThanOrEqual(titleBounds.x + 1);
  await expect(row(page, OLD).locator('[data-action="event-status-select"]')).toBeFocused();
  await page.locator('[data-action="dismiss-notice"]').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("pinned-events.png"), fullPage: true });
});

test("pinning respects archive and lifecycle filters and restores the pin when unarchived", async ({ page }) => {
  await seed(page);
  await pin(page, OLD, true);
  await menu(page, OLD);
  await page.locator('[data-action="toggle-personal-event-archive"]').click();
  await expect(row(page, OLD)).toHaveCount(0);
  await expect(page.locator(".event-list .event-notes-section-label")).toHaveCount(0);
  await page.locator('[data-action="event-status-filter"][data-filter="archive"]').click();
  await order(page, [OLD]);
  await expect(row(page, OLD).locator(".event-note-pin")).toBeVisible();
  await menu(page, OLD);
  await page.locator('[data-action="toggle-personal-event-archive"]').click();
  await expect(row(page, OLD)).toHaveCount(0);
  await page.locator('[data-action="event-status-filter"][data-filter="events"]').click();
  await order(page, [OLD, NEW, CLOSED]);
  await page.locator('[data-action="event-lifecycle-filter"][data-filter="paid"]').click();
  await expect(row(page, OLD)).toHaveCount(0);
  await expect(page.locator(".event-list .event-notes-section-label")).toHaveCount(0);
  await page.locator('[data-action="event-lifecycle-filter"][data-filter="all"]').click();
  await order(page, [OLD, NEW, CLOSED]);
});

test("failed preference writes keep the previous order and allow a successful retry", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await seed(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    window.__qaBlockPinWrite = true;
    Storage.prototype.setItem = function(name, value) {
      if (window.__qaBlockPinWrite && name === key) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, KEY);
  await menu(page, OLD);
  await pinButton(page).click();
  await expect(page.locator('.event-status-menu [role="alert"]')).toContainText("לא הצלחנו לשמור");
  await expect(pinButton(page)).toHaveAttribute("aria-pressed", "false");
  await order(page, [NEW, OLD, CLOSED]);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
  await page.evaluate(() => { window.__qaBlockPinWrite = false; });
  await pinButton(page).click();
  await expect(page.locator(".event-status-menu")).toHaveCount(0);
  await order(page, [OLD, NEW, CLOSED]);
  await page.reload();
  await order(page, [OLD, NEW, CLOSED]);
  expect(errors).toEqual([]);
});

test("personal pins survive incoming event changes and do not affect another participant", async ({ page, browser }) => {
  const cloud = await personalPinsCloud(page, test.info().project.use.baseURL, state);
  await pin(page, OLD, true);
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: "block" });
  try {
    const friend = await other.newPage();
    await seed(friend, FRIEND);
    await order(friend, [NEW, OLD, CLOSED]);
    await pin(friend, CLOSED, true); // Personal ordering is available to non-admins too.
    await order(friend, [CLOSED, NEW, OLD]);
    const updated = cloud.state();
    updated.events.find(event => event.id === OLD).name = "השם עודכן ממכשיר אחר";
    updated.events.find(event => event.id === OLD).settingsUpdatedAt = new Date().toISOString();
    cloud.update(updated);
    await cloud.reload();
    await expect(row(page, OLD)).toContainText("השם עודכן ממכשיר אחר");
    await order(page, [OLD, NEW, CLOSED]);
    await expect(row(page, CLOSED).locator(".event-note-pin")).toHaveCount(0);
    updated.events = updated.events.filter(event => event.id !== OLD);
    updated.deletedEvents.push({ id: OLD, deletedAt: new Date().toISOString(), deletedByParticipantId: updated.currentParticipantId });
    cloud.update(updated);
    await cloud.reload();
    await expect(row(page, OLD)).toHaveCount(0);
    await expect(page.locator(".event-list .event-notes-section-label")).toHaveCount(0);
    expect(cloud.reads.some(snapshot => snapshot.state.events.some(event => event.name === "השם עודכן ממכשיר אחר"))).toBe(true);
    if (cloud.diagnostics.length) await test.info().attach("webkit-document-replacement-diagnostics", {
      contentType: "application/json",
      body: JSON.stringify(cloud.diagnostics.map(({ url, stack, reason }) => ({ url, stack, reason })))
    });
    expect(cloud.errors).toEqual([]);
  } finally { await other.close(); }
});

test("another tab updates personal pins without losing a newer pin or reopening menus", async ({ page, context }) => {
  await seed(page);
  const other = await context.newPage();
  await other.goto("/");
  await order(other, [NEW, OLD, CLOSED]);
  await pin(page, OLD, true);
  await order(other, [OLD, NEW, CLOSED]);
  await pin(other, CLOSED, true);
  await order(page, [OLD, CLOSED, NEW]);
  await pin(page, OLD, false);
  await order(other, [CLOSED, NEW, OLD]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)).toEqual([CLOSED]);
  await expect(page.locator(".event-status-menu")).toHaveCount(0);
  await expect(other.locator(".event-status-menu")).toHaveCount(0);
});

test("two independent account contexts sync pin and unpin through the private workspace", async ({ page, browser }) => {
  const cloud = await personalPinsCloud(page, test.info().project.use.baseURL, state);
  const secondContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: "block" });
  try {
    const second = await secondContext.newPage();
    await cloud.connectPage(second);
    await order(second, [NEW, OLD, CLOSED]);
    await pin(page, OLD, true);
    expect(cloud.state().personalEventPinPreferences.updates[OLD].pinned).toBe(true);
    // The second device still has its older snapshot: its save must retry CAS.
    await pin(second, CLOSED, true);
    expect(cloud.conflicts()).toBeGreaterThan(0);
    expect(cloud.state().personalEventPinPreferences.updates[OLD].pinned).toBe(true);
    await cloud.reload();
    await order(page, [OLD, CLOSED, NEW]);
    await pin(page, OLD, false);
    expect(cloud.state().personalEventPinPreferences.updates[OLD].pinned).toBe(false);
    await second.reload();
    await order(second, [CLOSED, NEW, OLD]);
    cloud.setOffline(second, true);
    await secondContext.setOffline(true);
    await pin(second, CLOSED, false);
    expect(cloud.state().personalEventPinPreferences.updates[CLOSED].pinned).toBe(true);
    cloud.setOffline(second, false);
    await secondContext.setOffline(false);
    await expect.poll(() => cloud.state().personalEventPinPreferences.updates[CLOSED].pinned,
      { timeout: 20000 }).toBe(false);
    await cloud.reload();
    await order(page, [NEW, OLD, CLOSED]);
  } finally { await secondContext.close(); }
});

test("legacy device pins migrate into the account snapshot after hydration", async ({ page }) => {
  const cloud = await personalPinsCloud(page, test.info().project.use.baseURL, state, { legacyPins: [OLD] });
  await order(page, [OLD, NEW, CLOSED]);
  await expect.poll(() => cloud.state().personalEventPinPreferences?.updates?.[OLD]?.pinned).toBe(true);
  await cloud.reload();
  await order(page, [OLD, NEW, CLOSED]);
});

test("a different authenticated account has independent pin preferences", async ({ page, browser }) => {
  const first = await personalPinsCloud(page, test.info().project.use.baseURL, state);
  await pin(page, OLD, true);
  const secondContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: "block" });
  try {
    const other = await secondContext.newPage();
    const second = await personalPinsCloud(other, test.info().project.use.baseURL, state,
      { accountId: "personal-pins-other-owner" });
    await order(other, [NEW, OLD, CLOSED]);
    await pin(other, CLOSED, true);
    await first.reload();
    await order(page, [OLD, NEW, CLOSED]);
    expect(first.state().personalEventPinPreferences.updates[OLD].pinned).toBe(true);
    expect(first.state().personalEventPinPreferences.updates[CLOSED]).toBeUndefined();
    expect(second.state().personalEventPinPreferences.updates[CLOSED].pinned).toBe(true);
    expect(second.state().personalEventPinPreferences.updates[OLD]).toBeUndefined();
  } finally { await secondContext.close(); }
});
