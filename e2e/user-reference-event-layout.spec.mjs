import { expect, test } from "@playwright/test";
import { openTypographyHome } from "./helpers/typographyReadiness.mjs";

test.use({ serviceWorkers: "block" });
const owner = "person-user-reference-owner";
const eventId = "event-user-reference-193";
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "בודק עיצוב", kind: "user", avatarPreset: "avatar-1" }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: eventId, name: "יציאה · 13.10 · 16:46", eventType: "outing", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: "2026-10-13T13:46:00.000Z", updatedAt: "2026-10-13T13:46:00.000Z",
    expenses: [], transfers: [], notes: [], activityLog: [] }]
};

test.beforeEach(async ({ page, request }, testInfo) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ owner, state }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner, displayName: "בודק עיצוב", avatarPreset: "avatar-1"
    }));
    localStorage.setItem("settle-friends-current-participant", owner);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { owner, state });
  const size = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
  await openTypographyHome(page, { path: size ? `/?dynamic-type-preview=${size}` : "/" });
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();
});

async function assertReferenceHeader(page, testInfo, view) {
  const screen = page.locator('#app > .screen');
  const header = screen.locator(':scope > .event-overview-header');
  const actions = header.locator('.event-header-actions');
  // The physical iPad photo of build 193 showed a separate green bar below tabs.
  // The user's accepted reference keeps all three utilities inside the event card.
  await expect(actions, "one action group must remain inside the shared green event header").toHaveCount(1);
  await expect(screen.locator(':scope > .event-header-actions'), "no detached utility bar").toHaveCount(0);
  await expect(header.locator('.event-header-meta')).toHaveCount(1);
  await expect(screen.locator(':scope > .event-header-meta'), "no duplicate metadata below tabs").toHaveCount(0);
  const buttons = actions.locator(':scope > button');
  await expect(buttons).toHaveCount(3);
  await expect(buttons.nth(0)).toHaveAttribute("data-action", "open-event-participants");
  await expect(buttons.nth(1)).toHaveAttribute("data-action", "open-event-participant-add");
  await expect(buttons.nth(2)).toHaveAttribute("data-action", "open-event-settings");
  await expect(buttons.nth(1)).toHaveAccessibleName("הזמנת חברים לאירוע");
  await page.evaluate(() => document.fonts.ready);
  await header.scrollIntoViewIfNeeded();
  const geometry = await screen.evaluate(screen => {
    const header = screen.querySelector(':scope > .event-overview-header');
    const actions = header.querySelector('.event-header-actions');
    const tabs = screen.querySelector(':scope > .event-workspace-nav');
    const rect = el => { const r = el.getBoundingClientRect(); return {
      top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height
    }; };
    const h = rect(header), a = rect(actions), t = rect(tabs);
    return { header:h, actions:a, tabs:t, ordered:Boolean(
      header.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING),
      pageWidth:document.documentElement.scrollWidth, viewport:innerWidth,
      labels:[...actions.querySelectorAll('.event-header-action-label')].map(label => {
        const range = document.createRange(); range.selectNodeContents(label);
        const b = rect(label.closest('button'));
        return { text:label.textContent.trim(), button:b,
          glyphs:[...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>({
            left:r.left,right:r.right,top:r.top,bottom:r.bottom
          })) };
      }) };
  });
  expect(geometry.ordered, "the reference header must precede workspace tabs").toBe(true);
  expect(geometry.actions.top).toBeGreaterThanOrEqual(geometry.header.top);
  expect(geometry.actions.bottom, "utilities must fit inside their green card").toBeLessThanOrEqual(geometry.header.bottom + 1);
  expect(geometry.header.bottom, "tabs must follow the complete event card").toBeLessThanOrEqual(geometry.tabs.top + 1);
  expect(geometry.pageWidth, "the shared reference must not create horizontal overflow").toBeLessThanOrEqual(geometry.viewport + 1);
  for (const label of geometry.labels) {
    expect(label.button.height, `${label.text}: usable touch target`).toBeGreaterThanOrEqual(44);
    expect(label.glyphs.length, `${label.text}: visible label`).toBeGreaterThan(0);
    for (const glyph of label.glyphs) {
      expect(glyph.left).toBeGreaterThanOrEqual(label.button.left - 1);
      expect(glyph.right).toBeLessThanOrEqual(label.button.right + 1);
      expect(glyph.top).toBeGreaterThanOrEqual(label.button.top - 1);
      expect(glyph.bottom).toBeLessThanOrEqual(label.button.bottom + 1);
    }
  }
  await testInfo.attach(`reference-${view}-geometry`, {
    body:JSON.stringify(geometry,null,2), contentType:"application/json"
  });
  await testInfo.attach(`reference-${view}-screen`, {
    body:await page.screenshot({fullPage:true}),contentType:"image/png"
  });
}

test("user reference keeps utilities in the same header across expenses summary and notes", async ({ page }, testInfo) => {
  await assertReferenceHeader(page,testInfo,"expenses");
  await page.locator('.event-workspace-summary').click();
  await expect(page.locator('[data-event-view="summary"]')).toBeVisible();
  await assertReferenceHeader(page,testInfo,"summary");
  await page.locator('.event-workspace-notes').click();
  await expect(page.locator('[data-screen-kind="event-notes"]')).toBeVisible();
  await assertReferenceHeader(page,testInfo,"notes");
  await page.locator('.event-workspace-expenses').click();
  await expect(page.locator('[data-screen-kind="event"]:not([data-event-view])')).toBeVisible();
  await assertReferenceHeader(page,testInfo,"return-to-expenses");
});
