import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const OWNER = "friend-visibility-owner";
const friends = Array.from({ length: 14 }, (_, index) => ({
  id: `visibility-friend-${index + 1}`,
  displayName: `חבר בדיקה ${index + 1}`,
  kind: "guest",
  avatarPreset: "avatar-2"
}));
const state = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: "בעל האירוע", kind: "user", avatarPreset: "avatar-1" },
    ...friends
  ],
  friendContacts: friends.map((friend) => ({
    participantId: friend.id,
    active: true,
    source: "offline",
    updatedAt: "2026-10-01T08:00:00.000Z"
  })),
  groups: [],
  deletedEvents: [],
  deletedParticipants: [],
  events: []
};

test("Hebrew ILS choice keeps the last selected friend visible and focused", async ({ page, request }, testInfo) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ state, owner }) => {
    if (!localStorage.getItem("friend-visibility-seeded")) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId: owner, displayName: "בעל האירוע", avatarPreset: "avatar-1"
      }));
      localStorage.setItem("settle-friends-current-participant", owner);
      localStorage.setItem("friend-visibility-seeded", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");

    // Playwright does not open a real iOS keyboard. Model only Safari's
    // visualViewport resize boundary while the currency search has focus.
    const viewport = new EventTarget();
    Object.assign(viewport, {
      width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    window.__setKeyboardViewport = (height) => {
      viewport.height = height;
      viewport.dispatchEvent(new Event("resize"));
    };
  }, { state, owner: OWNER });
  await page.goto("/");
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();

  await page.locator('[data-action="new-event"]').first().click();
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  const currency = page.locator('.new-event-inline-picker[data-picker-action="new-event-currency-choice"]');
  await expect(currency.locator('[data-choice-value="ILS"]')).toHaveAttribute("aria-pressed", "true");
  await currency.locator("summary").click();
  const currencySearch = currency.locator('[data-action="new-event-currency-search"]');
  if (testInfo.project.name === "iphone-webkit") {
    await page.evaluate(() => window.__setKeyboardViewport(420));
  }
  await currencySearch.fill("שקל");
  await expect(currencySearch).toBeFocused();
  if (testInfo.project.name === "iphone-webkit") {
    await page.evaluate(() => window.__setKeyboardViewport(innerHeight));
    await expect(currencySearch).toBeFocused();
  }
  const ils = currency.locator('[data-action="new-event-currency-choice"]:visible');
  await expect(ils).toHaveCount(1);
  await expect(ils).toHaveAttribute("data-choice-value", "ILS");
  await ils.click();
  await expect(currency.locator("summary")).toContainText("שקל ישראלי");

  await page.locator('[data-action="open-new-event-settlement"]').click();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await page.locator('[data-action="set-new-event-participant-view"][data-participant-view="friends"]').click();

  const row = (number) => page.locator(
    `[data-action="toggle-new-event-participant"][data-participant-id="visibility-friend-${number}"]`
  );
  const checkbox = (number) => page.locator(
    `[data-action="new-event-participant"][data-participant-id="visibility-friend-${number}"]`
  );
  await row(14).click();
  await expect(checkbox(14)).toBeChecked();
  await expect(checkbox(14)).toBeFocused();
  await expectRowReachable(row(14), page);

  await row(13).click();
  await expect(checkbox(13)).toBeChecked();
  await expect(checkbox(14)).toBeChecked();
  await expect(checkbox(13)).toBeFocused();
  await expectRowReachable(row(13), page);

  await row(14).click();
  await expect(page.locator('[data-important-action-kind="remove-new-event-participant"]')).toBeVisible();
  await page.locator('[data-action="confirm-important-action"]').click();
  await expect(checkbox(14)).not.toBeChecked();
  await expect(checkbox(13)).toBeChecked();
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect(checkbox(13)).toBeChecked();
  // The overview renders only selected participants, so the removed friend
  // must be absent here and unchecked when the complete friend list reopens.
  await expect(checkbox(14)).toHaveCount(0);
  await page.locator('[data-action="set-new-event-participant-view"][data-participant-view="friends"]').click();
  await expect(checkbox(13)).toBeChecked();
  await expect(checkbox(14)).not.toBeChecked();
});

async function expectRowReachable(row, page) {
  await expect.poll(() => row.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const footer = document.querySelector(".new-event-participant-subview-footer");
    const lowerEdge = Math.min(innerHeight, footer?.getBoundingClientRect().top ?? innerHeight);
    return rect.top >= 0 && rect.bottom <= lowerEdge;
  }), { message: "the selected friend must remain visible above the footer" }).toBe(true);
}
