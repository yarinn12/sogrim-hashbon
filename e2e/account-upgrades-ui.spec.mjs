import { expect, test } from "@playwright/test";

const owner = "account-upgrade-owner";
let runtimeErrors = [];
const friends = Array.from({ length: 14 }, (_, index) => ({
  id: `upgrade-friend-${index + 1}`,
  displayName: `חבר מספר ${String(index + 1).padStart(2, "0")}`,
  kind: "guest",
  avatarPreset: "avatar-2"
}));
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "יוצר האירוע", kind: "user", avatarPreset: "avatar-1" }, ...friends],
  friendContacts: friends.map((friend) => ({
    participantId: friend.id, active: true, source: "offline", updatedAt: "2026-10-01T08:00:00.000Z"
  })),
  groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: "upgrade-existing-event", name: "אירוע בדיקת ממשק", eventType: "standard", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z",
    expenses: [], transfers: [], notes: [], activityLog: []
  }]
};

test.beforeEach(async ({ page, request }, testInfo) => {
  runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ state }) => {
    if (!localStorage.getItem("qa-upgrade-ui-seeded")) {
      localStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId: state.currentParticipantId, displayName: "יוצר האירוע", avatarPreset: "avatar-1"
      }));
      localStorage.setItem("settle-friends-current-participant", state.currentParticipantId);
      localStorage.setItem("qa-upgrade-ui-seeded", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state });
  const fontSize = testInfo.project.metadata.dynamicTypePreview ||
    (testInfo.project.metadata.reflowScale ? 32 : 16);
  await page.goto(`/?dynamic-type-preview=${fontSize}`);
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
});

test.afterEach(() => expect(runtimeErrors).toEqual([]));

async function capture(page, testInfo, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, `${name} must fit the viewport`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

test("currency search and reordered friends remain usable in RTL layouts", async ({ page }, testInfo) => {
  await capture(page, testInfo, "home-upgrade");
  await page.locator('[data-action="new-event"]').first().click();
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  const picker = page.locator(".new-event-inline-picker").filter({ hasText: "מטבע האירוע" });
  await expect(picker.locator("summary")).toContainText("שקל ישראלי");
  await picker.locator("summary").click();
  const search = picker.locator('[data-action="new-event-currency-search"]');
  await search.fill("MXN");
  await expect(picker.locator('[data-action="new-event-currency-choice"]:visible')).toHaveCount(1);
  await capture(page, testInfo, "currency-search-upgrade");
  await search.clear();
  await picker.locator("summary").click();
  await page.locator('[data-action="open-new-event-settlement"]').click();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await expect(page.locator(".new-event-selected-participant.is-current-participant")).toBeVisible();
  await expect(page.locator(".new-event-selected-participant.is-current-participant .new-event-selected-participant-check")).toHaveCount(0);
  await capture(page, testInfo, "participants-upgrade");
  await page.locator('[data-action="set-new-event-participant-view"][data-participant-view="friends"]').click();
  const target = page.locator('[data-action="toggle-new-event-participant"][data-participant-id="upgrade-friend-14"]');
  await target.click();
  const checkbox = page.locator('[data-action="new-event-participant"][data-participant-id="upgrade-friend-14"]');
  await expect(checkbox).toBeFocused();
  await expect(checkbox).toBeChecked();
  await expect.poll(() => target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
  await capture(page, testInfo, "friend-selected-upgrade");
});

test("shared notes and bottom participant action remain visible", async ({ page }, testInfo) => {
  await page.locator('[data-action="open-event"][data-event-id="upgrade-existing-event"]').first().click();
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('[data-screen-kind="event-notes"]')).toContainText("פתקים משותפים");
  await expect(page.locator('[data-action="new-event-note"]')).toContainText("פתק חדש");
  await expect(page.locator(".event-notes-empty")).toHaveCount(0);
  await capture(page, testInfo, "notes-upgrade");
  await page.locator('[data-action="open-event-participants"]').click();
  const button = page.locator(".event-participant-add-launch");
  await expect(button).toContainText("הוסף משתתפים");
  const centerGap = await button.evaluate((element) => {
    const buttonBox = element.getBoundingClientRect();
    const contents = [...element.children].map((child) => child.getBoundingClientRect());
    const left = Math.min(...contents.map((box) => box.left));
    const right = Math.max(...contents.map((box) => box.right));
    return Math.abs((left + right) / 2 - (buttonBox.left + buttonBox.right) / 2);
  });
  expect(centerGap).toBeLessThanOrEqual(3);
  await capture(page, testInfo, "roster-upgrade");
});
