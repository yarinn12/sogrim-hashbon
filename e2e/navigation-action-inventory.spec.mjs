import { expect, test } from "@playwright/test";
import { holdNonessentialHomeImage } from "./helpers/heldHomeImage.mjs";
import { openRenderedHome } from "./helpers/typographyReadiness.mjs";

const OWNER = "person-navigation-owner";
const FRIEND = "person-navigation-friend";
const EVENT = "event-navigation-fixture";
const state = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: "בדיקת ניווט", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND, displayName: "חבר לבדיקה", kind: "user", avatarPreset: "avatar-2" }
  ],
  friendContacts: [{ participantId: FRIEND, createdAt: "2026-10-01T08:00:00.000Z" }],
  groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: EVENT, name: "אירוע ניווט", eventType: "outing", currency: "ILS",
    participantIds: [OWNER, FRIEND], adminIds: [OWNER], createdByParticipantId: OWNER,
    createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z",
    expenses: [], transfers: [], notes: [], activityLog: []
  }]
};

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", owner);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner, displayName: "בדיקת ניווט", avatarPreset: "avatar-1"
    }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state, owner: OWNER });
});

async function recordControls(page, testInfo, screen) {
  const controls = await page.locator("#app .screen").evaluate((root) =>
    [...root.querySelectorAll("button, a[href], summary")]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden")
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        action: node.dataset.action || "",
        destination: node.dataset.navDestination || "",
        href: node.getAttribute("href") || "",
        fragmentTargetFound: !node.getAttribute("href")?.startsWith("#") ||
          Boolean(document.getElementById(node.getAttribute("href").slice(1))),
        name: node.getAttribute("aria-label")?.trim() || node.textContent?.trim() || node.getAttribute("title") || "",
        disabled: node.disabled || node.getAttribute("aria-disabled") === "true"
      }))
  );
  const unlabeled = controls.filter((control) => !control.disabled && !control.name);
  expect(unlabeled, `${screen}: every active control needs a readable name`).toEqual([]);
  // In-page anchors are valid only when their destination exists on this screen.
  expect(controls.filter((control) => /^javascript:/i.test(control.href) ||
    (control.href.startsWith("#") && !control.fragmentTargetFound)), `${screen}: no broken link targets`).toEqual([]);
  await testInfo.attach(`controls-${screen}`, { body: JSON.stringify(controls, null, 2), contentType: "application/json" });
  return { screen, controls };
}

test("home, event, notes, modal, notifications, profile and friends actions navigate and return", async ({ page }, testInfo) => {
  const inventory = [];
  await page.goto("/");
  const home = page.locator('.screen[data-screen-kind="home"]');
  await expect(home).toBeVisible();
  await expect(home.locator('[data-action="go-back"]')).toBeDisabled();
  inventory.push(await recordControls(page, testInfo, "home"));

  await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
  await expect(page.locator('.screen[data-screen-kind="event"]')).toBeVisible();
  inventory.push(await recordControls(page, testInfo, "event"));

  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('.screen[data-screen-kind="event-notes"]')).toBeVisible();
  inventory.push(await recordControls(page, testInfo, "notes"));
  await page.locator('[data-action="new-event-note"]').click();
  await expect(page.locator('.event-note-modal[role="dialog"]')).toBeVisible();
  inventory.push(await recordControls(page, testInfo, "note-dialog"));
  await page.locator('.event-note-modal [data-action="close-event-dialog"]').click();
  await expect(page.locator('.event-note-modal')).toHaveCount(0);
  await expect(page.locator('.event-note-open')).toHaveCount(0);

  await page.locator('[data-nav-destination="home"]').click();
  await expect(home).toBeVisible();
  await expect(home.locator('[data-action="go-back"]')).toBeEnabled();
  await home.locator('[data-action="go-back"]').click();
  await expect(page.locator('.screen[data-screen-kind="event-notes"]')).toBeVisible();

  await page.locator('[data-nav-destination="notifications"]').click();
  await expect(page.locator('.screen[data-screen-kind="notifications"]')).toBeVisible();
  inventory.push(await recordControls(page, testInfo, "notifications"));
  await page.locator('.screen[data-screen-kind="notifications"] [data-action="go-back"]').click();
  await expect(page.locator('.screen[data-screen-kind="event-notes"]')).toBeVisible();

  await page.locator('[data-nav-destination="profile"]').click();
  await expect(page.locator('.screen[data-screen-kind="profile"]')).toBeVisible();
  inventory.push(await recordControls(page, testInfo, "profile"));
  await page.locator('[data-nav-destination="home"]').click();
  await home.locator('[data-action="groups"]').click();
  await expect(page.locator('.screen[data-screen-kind="groups"]')).toBeVisible();
  inventory.push(await recordControls(page, testInfo, "friends"));

  console.log(JSON.stringify({ kind: "navigation-control-inventory", device: testInfo.project.name,
    screens: inventory.map(({ screen, controls }) => ({ screen, active: controls.filter(x => !x.disabled).length, disabled: controls.filter(x => x.disabled).length })) }));
});

test("valid and missing event deep links have a clear destination and feedback", async ({ page }, testInfo) => {
  await page.goto(`/?event=${EVENT}`);
  await expect(page.locator('.screen[data-screen-kind="event"]')).toBeVisible();
  await expect(page.locator('.screen[data-screen-kind="event"]')).toContainText("אירוע ניווט");
  await page.locator('[data-nav-destination="home"]').click();
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.has("event")).toBe(false);
  await page.goto("/?event=event-not-found");
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
  await expect(page.getByText("קישור ההזמנה לא נמצא.", { exact: true })).toBeVisible();
  await recordControls(page, testInfo, "missing-link-home");
});

test("repeated home back taps return to one previous screen", async ({ page }) => {
  await page.goto("/");
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('.screen[data-screen-kind="event-notes"]')).toBeVisible();
  await page.locator('[data-nav-destination="home"]').click();
  const back = page.locator('.screen[data-screen-kind="home"] [data-action="go-back"]');
  await expect(back).toBeEnabled();
  await back.evaluate((button) => { button.click(); button.click(); });
  await expect(page.locator('.screen[data-screen-kind="event-notes"]')).toBeVisible();
});

test("permission feedback for an unavailable event has no broken review action", async ({ page }) => {
  await page.goto("/");
  const home = page.locator('.screen[data-screen-kind="home"]');
  await expect(home.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("sogrim:sync-status", { detail: {
    status: "unavailable", pending: true, pendingEventIds: ["event-unavailable"], failureKind: "permission"
  } })));
  const summary = home.locator("[data-sync-account-summary]");
  await expect(summary).toContainText("אין הרשאה לבצע את השינוי");
  await expect(summary.locator('[data-action="open-event"]')).toHaveCount(0);
});

async function assertLatePermissionFeedbackKeepsEventActionStable(page) {
  await openRenderedHome(page);
  const home = page.locator('.screen[data-screen-kind="home"]');
  await expect(home.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first()).toBeVisible();
  const summary = home.locator("[data-sync-account-summary]");
  await expect(summary).not.toHaveAttribute("data-sync-account-event-id");
  await page.evaluate((eventId) => window.dispatchEvent(new CustomEvent("sogrim:sync-status", { detail: {
    status: "unavailable", pending: true, pendingEventIds: [eventId], failureKind: "permission"
  } })), EVENT);
  const review = summary.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`);
  await expect(summary).toContainText("אירוע ניווט");
  await expect(review).toHaveCount(1);
  const stableAfterObserver = await page.evaluate(() => new Promise((resolve) => {
    const summary = document.querySelector("[data-sync-account-summary]");
    const button = summary.querySelector('[data-action="open-event"]');
    const mutation = document.createElement("span");
    summary.closest(".product-home-screen").append(mutation);
    setTimeout(() => {
      resolve(button === summary.querySelector('[data-action="open-event"]'));
      mutation.remove();
    }, 100);
  }));
  expect(stableAfterObserver).toBe(true);
  await expect(summary).toContainText("אירוע ניווט");
  await expect(review).toHaveCount(1);
}

test("permission feedback arriving after home render keeps its event action stable", async ({ page }) => {
  await assertLatePermissionFeedbackKeepsEventActionStable(page);
});

test("late permission feedback keeps its event action stable before a nonessential image loads", async ({ page, baseURL }) => {
  const heldImage = await holdNonessentialHomeImage(page, baseURL);
  try {
    await assertLatePermissionFeedbackKeepsEventActionStable(page);
    expect(heldImage.requested, "the held image must actually be requested").toBe(true);
    expect(await page.evaluate(() => document.readyState)).toBe("interactive");
  } finally {
    heldImage.release();
  }
});
