import { expect, test } from "@playwright/test";
import { resetLocalQaStateFresh } from "./helpers/resetLocalQaStateFresh.mjs";
import { writeLocalQaStateFresh } from "./helpers/writeLocalQaStateFresh.mjs";
import { settlementIncomingWorkspace } from "./helpers/settlementIncomingWorkspace.mjs";
import { localQaNavigationReady } from "./helpers/localQaNavigationReady.mjs";
import { installFreshLoopbackRoutes } from "./helpers/installFreshLoopbackRoutes.mjs";

// Keep page routing in control of the synthetic workspace, as in pinned-events.
test.use({ serviceWorkers: "block" });

const OWNER = "confirmation-nav-owner";
const FRIEND = "confirmation-nav-friend";
const EVENT = "confirmation-nav-event-a";
const OTHER_EVENT = "confirmation-nav-event-b";
const INCOMING_CASE = "an incoming update on the same event keeps close confirmation protected and usable";
const incomingClients = new WeakMap();
const seededState = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: "נועם לוי", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND, displayName: "מיכל כהן", kind: "user", avatarPreset: "avatar-2" }
  ],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [EVENT, OTHER_EVENT].map(id => ({
    id, name: id === EVENT ? "בדיקת אישור סגירה" : "אירוע אחר לבדיקה",
    eventType: "outing", currency: "ILS", participantIds: [OWNER, FRIEND],
    adminIds: [OWNER], createdByParticipantId: OWNER,
    createdAt: "2026-11-18T08:00:00.000Z", updatedAt: "2026-11-18T08:10:00.000Z",
    statusUpdatedAt: "2026-11-18T08:10:00.000Z", roundSettlementTransfers: false,
    locked: false, transfers: [], activityLog: [],
    expenses: [{ id: `${id}-expense`, name: "מונית", total: 10000,
      payers: [{ participantId: OWNER, amount: 10000 }], sharedByParticipantIds: [OWNER, FRIEND],
      createdByParticipantId: OWNER, updatedAt: "2026-11-18T08:10:00.000Z" }],
    notes: [{ id: `${id}-note`, title: "פרטי המפגש", body: "תוכן שנשמר במעבר מסך",
      pinned: false, createdByParticipantId: OWNER, updatedByParticipantId: OWNER,
      createdAt: "2026-11-18T08:05:00.000Z", updatedAt: "2026-11-18T08:05:00.000Z" }]
  }))
};

test.beforeEach(async ({ page, browser, baseURL }, testInfo) => {
  if (testInfo.title === INCOMING_CASE) {
    incomingClients.set(page, await settlementIncomingWorkspace(page, browser, baseURL, seededState));
  } else {
  await resetLocalQaStateFresh(baseURL);
  await writeLocalQaStateFresh(baseURL, seededState);
  await installFreshLoopbackRoutes(page, baseURL);
  await page.addInitScript(state => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", state.currentParticipantId);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: state.currentParticipantId, displayName: "נועם לוי", avatarPreset: "avatar-1"
    }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, seededState);
  await localQaNavigationReady(page, "/", `[data-action="open-event"][data-event-id="${EVENT}"]`);
  }
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
  await page.locator('.event-workspace-summary[data-action="settle"]').click();
  await page.locator('[data-action="close-event"]').first().click();
  await expectProtectedConfirmation(page);
});

test.afterEach(async ({ page }) => {
  await incomingClients.get(page)?.close();
});

async function expectProtectedConfirmation(page) {
  await expect(page.locator(".settlement-close-confirmation")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/app-dialog-open/);
  await expect.poll(() => page.locator(".product-app-identity [data-app-dialog-inert]").count())
    .toBeGreaterThan(0);
  await expect(page.locator(".settlement-close-confirmation-backdrop [data-nav-destination][inert]"))
    .toHaveCount(0);
}

async function expectReleasedNavigation(page, screenKind) {
  await expect(page.locator(`.screen[data-screen-kind="${screenKind}"]`)).toBeVisible();
  await expect(page.locator(".settlement-close-confirmation")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/app-dialog-open/);
  await expect(page.locator("[data-app-dialog-inert], [data-app-dialog-inert-container]"))
    .toHaveCount(0);
}

const eventData = page => page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")).events);

for (const [destination, kind] of [
  ["home", "home"], ["friends", "groups"], ["notifications", "notifications"], ["profile", "profile"]
]) {
  test(`close confirmation navigation to ${destination} releases the destination without changing event data`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const before = await eventData(page);
    await page.locator(`.settlement-close-confirmation-backdrop [data-nav-destination="${destination}"]`).click();
    await expectReleasedNavigation(page, kind);
    expect(await page.evaluate(() => history.state.view.settlementCloseConfirmation)).toBeNull();

    if (destination === "profile") {
      await page.goBack();
      await expectProtectedConfirmation(page);
      await page.goForward();
      await expectReleasedNavigation(page, kind);
    }
    for (const [next, screen] of [["home", "home"], ["friends", "groups"], ["notifications", "notifications"], ["profile", "profile"], ["home", "home"]]) {
      await page.locator(`[data-nav-destination="${next}"]:visible`).first().click();
      await expectReleasedNavigation(page, screen);
    }
    await page.locator(`[data-action="open-event"][data-event-id="${OTHER_EVENT}"]`).first().click();
    await expectReleasedNavigation(page, "event");
    await expect(page.locator('.screen[data-screen-kind="event"]')).toHaveAttribute("data-event-id", OTHER_EVENT);
    expect(await eventData(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test(INCOMING_CASE, async ({ page }) => {
  const clients = incomingClients.get(page);
  const before = await clients.localEvents();
  const canonicalBefore = await clients.readCanonical();
  const incoming = structuredClone(canonicalBefore);
  const event = incoming.state.events.find(item => item.id === EVENT);
  event.notes[0].body = "עדכון סינתטי שנכנס בזמן האישור";
  event.name = "עדכון שנכנס כשהאישור פתוח";
  event.notes[0].updatedAt = new Date(Date.now() + 1000).toISOString();
  event.updatedAt = event.notes[0].updatedAt;
  // Actual peer GET/PATCH/CAS/ACK through the selected mock-cloud transport.
  // No live cloud, direct DOM mutation or seed-only /api/state write is used.
  const acknowledgement = await clients.writeCanonical(incoming);
  const canonicalAfterWrite = await clients.readCanonical();
  expect(canonicalAfterWrite.updated_at).toBe(acknowledgement.updated_at);
  expect(canonicalAfterWrite.state.events.find(item => item.id === EVENT).notes[0].body).toBe(event.notes[0].body);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("settle-friends:native-resume")));
  // A rendered title proves adoption in the app, beyond a changed cache value.
  await expect(page.locator('#app .screen h1')).toHaveText(event.name);
  await expectProtectedConfirmation(page);
  await expect(page.locator('.settlement-close-confirmation [data-action="confirm-close-event"]'))
    .toHaveAttribute("data-event-id", EVENT);
  await page.locator('.settlement-close-confirmation [data-action="cancel-close-event-confirmation"]').last().click();
  // Settlement shares the event screen kind; its own class identifies the view.
  await expectReleasedNavigation(page, "event");
  await expect(page.locator(".settlement-screen")).toBeVisible();
  const financial = events => events.map(item => ({ id: item.id, locked: item.locked, expenses: item.expenses, transfers: item.transfers }));
  const after = await clients.localEvents();
  expect(financial(after)).toEqual(financial(before));
  const canonicalAfter = await clients.readCanonical();
  expect(financial(canonicalAfter.state.events)).toEqual(financial(canonicalBefore.state.events));
  expect(after.find(item => item.id === EVENT).notes[0].body).toBe(event.notes[0].body);
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator(`.event-note-open[data-note-id="${EVENT}-note"]`)).toContainText(event.notes[0].body);
  expect(clients.cloud.errors).toEqual([]);
});
