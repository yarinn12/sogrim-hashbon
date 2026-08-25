import { expect, test } from "@playwright/test";

const OWNER_ID = "scroll-intent-owner";
const EVENT_ID = "scroll-intent-event";
const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    { id: OWNER_ID, displayName: "בודק גלילה", kind: "user", avatarPreset: "avatar-1" }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "בדיקת גלילה בהגדרות",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-25T08:00:00.000Z",
      updatedAt: "2026-08-25T08:00:00.000Z",
      expenses: [],
      transfers: [],
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ ownerId, state }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId: ownerId,
        displayName: "בודק גלילה",
        avatarPreset: "avatar-1"
      })
    );
    localStorage.setItem("settle-friends-current-participant", ownerId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { ownerId: OWNER_ID, state: seededState });
  await page.goto("/");
  await page.evaluate(() => {
    window.__scrollIntentActivations = 0;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.scrollIntentProbe = "true";
    button.innerHTML = "<span>בדיקת מגע</span>";
    button.addEventListener("click", () => {
      window.__scrollIntentActivations += 1;
    });
    document.body.append(button);
  });
});

test("finger scrolling does not activate controls but a deliberate tap does", async ({ page }) => {
  const afterScroll = await dispatchTouchSequence(page, { moveY: 24, clickDetail: 1 });
  expect(afterScroll).toBe(0);

  const afterTap = await dispatchTouchSequence(page, { moveY: 0, clickDetail: 1 });
  expect(afterTap).toBe(1);
});

test("an actual scroll suppresses activation without blocking keyboard access", async ({ page }) => {
  const afterScroll = await dispatchTouchSequence(page, {
    moveY: 0,
    dispatchScroll: true,
    clickDetail: 1
  });
  expect(afterScroll).toBe(0);

  const afterKeyboardClick = await page.evaluate(() => {
    const target = document.querySelector("[data-scroll-intent-probe] span");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    return window.__scrollIntentActivations;
  });
  expect(afterKeyboardClick).toBe(1);
});

test("scrolling on an event settings row keeps the settings overview open", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const managementCard = page.locator('[data-settings-section="management"]');
  await expect(managementCard).toBeVisible();
  await managementCard.evaluate((button) => {
    const target = button.querySelector("strong") ?? button;
    const pointer = (type, y) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 12,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 30,
      clientY: y
    });
    target.dispatchEvent(pointer("pointerdown", 80));
    target.dispatchEvent(pointer("pointermove", 104));
    target.dispatchEvent(pointer("pointerup", 104));
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));
  });

  await expect(page.getByRole("heading", { name: "הגדרות האירוע" })).toBeVisible();
  await expect(managementCard).toBeVisible();

  await managementCard.click();
  await expect(page.getByRole("heading", { name: "אופן ניהול" })).toBeVisible();
});

async function dispatchTouchSequence(page, {
  moveY,
  dispatchScroll = false,
  clickDetail
}) {
  return page.evaluate(({ moveY, dispatchScroll, clickDetail }) => {
    const button = document.querySelector("[data-scroll-intent-probe]");
    const target = button.querySelector("span");
    const pointer = (type, y) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 11,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: y
    });

    target.dispatchEvent(pointer("pointerdown", 20));
    if (moveY) target.dispatchEvent(pointer("pointermove", 20 + moveY));
    if (dispatchScroll) button.dispatchEvent(new Event("scroll"));
    target.dispatchEvent(pointer("pointerup", 20 + moveY));
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: clickDetail
    }));
    return window.__scrollIntentActivations;
  }, { moveY, dispatchScroll, clickDetail });
}
