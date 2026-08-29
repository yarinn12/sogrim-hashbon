import { expect, test } from "@playwright/test";

const OWNER_ID = "person-home-options-owner";
const FRIEND_ID = "person-home-options-friend";
const EVENT_ID = "event-home-options";

const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    { id: OWNER_ID, displayName: "ירין יצחק", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND_ID, displayName: "מאור כהן", kind: "user", avatarPreset: "avatar-2" }
  ],
  friendContacts: [
    { participantId: FRIEND_ID, createdAt: "2026-08-27T08:00:00.000Z" }
  ],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "בדיקת אפשרויות",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID, FRIEND_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-27T08:00:00.000Z",
      updatedAt: "2026-08-27T08:00:00.000Z",
      expenses: [],
      transfers: [],
      transferStatusUpdates: [],
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

test("home event chevron opens the standard share/remove flow without a lifecycle status", async ({ page }) => {
  const row = page.locator(`.event-row[data-event-id="${EVENT_ID}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator(".event-status-indicator")).toHaveCount(0);
  await expect(row.locator(".event-row-options-chevron")).toBeVisible();
  await expect(row).not.toContainText("פתוח");
  await expect(row).not.toContainText("סגור");

  await row.locator('[data-action="event-status-select"]').click();
  const menu = page.locator(".event-status-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-action="share-event-from-list"]')).toBeVisible();
  await expect(menu.locator('[data-action="remove-event-from-list"]')).toBeVisible();
  await expect(menu.locator('[data-action="choose-event-status"]')).toHaveCount(0);

  await menu.locator('[data-action="share-event-from-list"]').click();
  const participantAdd = page.locator(".event-participant-add-screen");
  await expect(participantAdd).toBeVisible();
  await expect(participantAdd).toContainText("שתף קישור או QR");
  await expect(participantAdd).toContainText("בחר מחברים");
  await expect(participantAdd).toContainText("הוסף שם ידנית");
});

test("participant pictures on a home card open the event instead of participant statistics", async ({ page }) => {
  const row = page.locator(`.event-row[data-event-id="${EVENT_ID}"]`);
  const friendPicture = row.locator(".avatar-stack .avatar").nth(1);

  await expect(friendPicture).toBeVisible();
  await expect(friendPicture).not.toHaveAttribute("data-action", "open-participant-statistics");
  await friendPicture.click();

  await expect(page.locator('.screen[data-screen-kind="event"]')).toBeVisible();
  await expect(page.locator(".relationship-scorecard")).toHaveCount(0);
});

test("home, notifications, and profile keep one identical brand mark", async ({ page }) => {
  const brandPresentation = async () => page.locator(".product-app-identity").evaluate((identity) => {
    const greeting = identity.querySelector(".product-brand-copy small")?.getBoundingClientRect();
    const product = identity.querySelector(".product-brand-copy strong")?.getBoundingClientRect();
    const mark = identity.querySelector(".product-brand-mark")?.getBoundingClientRect();
    const image = identity.querySelector(".product-brand-image");
    const imageRect = image?.getBoundingClientRect();
    const imageStyle = image ? getComputedStyle(image) : null;
    return {
      profileFirst: identity.classList.contains("is-profile-first-context"),
      greetingTop: greeting?.top ?? 0,
      productTop: product?.top ?? 0,
      markWidth: mark?.width ?? 0,
      markHeight: mark?.height ?? 0,
      imageWidth: imageRect?.width ?? 0,
      imageHeight: imageRect?.height ?? 0,
      objectFit: imageStyle?.objectFit ?? "",
      transform: imageStyle?.transform ?? ""
    };
  });

  const homePresentation = await brandPresentation();
  expect(homePresentation.profileFirst).toBe(true);
  expect(homePresentation.greetingTop).toBeLessThan(homePresentation.productTop);
  expect(homePresentation).toMatchObject({
    markWidth: 42,
    markHeight: 42,
    imageWidth: 42,
    imageHeight: 42,
    objectFit: "contain",
    transform: "none"
  });

  await page.locator('[data-action="open-notifications"]').click();
  await expect(page.locator('.screen[data-screen-kind="notifications"]')).toBeVisible();
  const notificationPresentation = await brandPresentation();
  expect(notificationPresentation.profileFirst).toBe(true);
  expect(notificationPresentation.greetingTop).toBeLessThan(notificationPresentation.productTop);
  expect(notificationPresentation).toMatchObject({
    markWidth: homePresentation.markWidth,
    markHeight: homePresentation.markHeight,
    imageWidth: homePresentation.imageWidth,
    imageHeight: homePresentation.imageHeight,
    objectFit: homePresentation.objectFit,
    transform: homePresentation.transform
  });

  await page.locator('.product-app-nav [data-action="edit-profile"]').click();
  await expect(page.locator('.screen[data-screen-kind="profile"]')).toBeVisible();
  const profilePresentation = await brandPresentation();
  expect(profilePresentation).toMatchObject({
    markWidth: homePresentation.markWidth,
    markHeight: homePresentation.markHeight,
    imageWidth: homePresentation.imageWidth,
    imageHeight: homePresentation.imageHeight,
    objectFit: homePresentation.objectFit,
    transform: homePresentation.transform
  });
});
