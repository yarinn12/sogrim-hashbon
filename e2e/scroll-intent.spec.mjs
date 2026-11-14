import { expect, test } from "@playwright/test";

const OWNER_ID = "scroll-intent-owner";
const PEER_ID = "scroll-intent-peer";
const EVENT_ID = "scroll-intent-event";
const seededState = {
  currentParticipantId: OWNER_ID,
  participants: [
    { id: OWNER_ID, displayName: "בודק גלילה", kind: "user", avatarPreset: "avatar-1" },
    { id: PEER_ID, displayName: "משתתף לבדיקה", kind: "guest", avatarPreset: "avatar-2" }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "בדיקת גלילה בהגדרות",
      eventType: "outing",
      currency: "ILS",
      participantIds: [OWNER_ID, PEER_ID],
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
    moveY: 3,
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

test("a stationary first tap survives an unrelated scroll event", async ({ page }) => {
  const afterTap = await dispatchTouchSequence(page, {
    moveY: 0,
    dispatchScroll: true,
    clickDetail: 1
  });
  expect(afterTap).toBe(1);
});

test("the first stationary tap opens a participant even while scroll restoration settles", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const participant = page.locator(
    `[data-action="open-event-participant-profile"][data-participant-id="${PEER_ID}"]`
  );
  await expect(participant).toBeVisible();
  await participant.evaluate((button) => {
    const target = button.querySelector("strong") ?? button;
    const pointer = (type) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 14,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 40,
      clientY: 80
    });
    target.dispatchEvent(pointer("pointerdown"));
    button.dispatchEvent(new Event("scroll"));
    target.dispatchEvent(pointer("pointerup"));
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));
  });

  await expect(page.locator(".event-participant-management-modal")).toBeVisible();
});

test("participant removal confirmation uses the shared in-flow app notice", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page
    .locator(`[data-action="open-event-participant-profile"][data-participant-id="${PEER_ID}"]`)
    .click();
  await page.locator('[data-action="remove-event-participant"]').click();
  await page.locator('[data-action="confirm-important-action"]').click();

  const toast = page.locator(".app-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("הסרנו את משתתף לבדיקה מהאירוע");
  await expect(toast).toHaveClass(/app-inline-notice/);
  await expect(toast).toHaveCSS("position", "static");
  await expect(toast).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(toast.locator(".app-toast-icon")).toHaveCount(0);
  const dismiss = toast.locator('[data-action="dismiss-notice"]');
  await expect(dismiss).toHaveAttribute(
    "aria-label",
    "סגירת ההודעה"
  );
  await expect(page.locator(".event-participant-notice")).toHaveCount(0);
  await toast.scrollIntoViewIfNeeded();
  const geometry = await toast.evaluate(element => {
    const rect = element.getBoundingClientRect(), close = element.querySelector('[data-action="dismiss-notice"]'), closeRect = close.getBoundingClientRect();
    const parent = element.parentElement, parentRect = parent.getBoundingClientRect(), style = getComputedStyle(parent);
    const copy = element.querySelector(".app-toast-copy"), hit = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2);
    const nav = [...document.querySelectorAll(".product-app-nav")].find(node => node.getClientRects().length)?.getBoundingClientRect();
    return {left: rect.left, right: rect.right, bottom: rect.bottom, viewport: innerWidth,
      contentLeft: parentRect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      contentRight: parentRect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
      nextTop: element.nextElementSibling?.getBoundingClientRect().top,
      closeWidth: closeRect.width, closeHeight: closeRect.height, ownsHit: !!hit && (hit === close || close.contains(hit)),
      copyClipped: copy.scrollWidth > copy.clientWidth + 1 || copy.scrollHeight > copy.clientHeight + 1,
      navTop: nav?.top ?? innerHeight};
  });
  expect(Math.abs(geometry.left - geometry.contentLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.right - geometry.contentRight)).toBeLessThanOrEqual(1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.bottom);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.navTop);
  expect(geometry.closeWidth).toBe(44);
  expect(geometry.closeHeight).toBe(44);
  expect(geometry.ownsHit).toBe(true);
  expect(geometry.copyClipped).toBe(false);
  await dismiss.click();
  await expect(toast).toHaveCount(0);
  expect(await page.evaluate(({eventId,peerId}) => {
    const state = JSON.parse(localStorage.getItem("settle-friends-state"));
    return state.events.find(event => event.id === eventId).participantIds.includes(peerId);
  }, {eventId: EVENT_ID, peerId: PEER_ID})).toBe(false);
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

test("scrolling from the accessibility button never opens accessibility", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const accessibilityEntry = page.locator(
    ".event-settings-route-backdrop [data-open-accessibility]"
  );
  await expect(accessibilityEntry).toBeVisible();
  await accessibilityEntry.evaluate((button) => {
    const target = button.querySelector("svg") ?? button;
    const pointer = (type, y) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 13,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 30,
      clientY: y
    });
    target.dispatchEvent(pointer("pointerdown", 70));
    target.dispatchEvent(pointer("pointermove", 98));
    target.dispatchEvent(pointer("pointerup", 98));
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));
  });

  await expect(page.locator(".accessibility-center")).toBeHidden();
  await expect(page.getByRole("heading", { name: "הגדרות האירוע" })).toBeVisible();

  await accessibilityEntry.click();
  await expect(page.locator('.accessibility-center[role="dialog"]')).toBeVisible();
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
