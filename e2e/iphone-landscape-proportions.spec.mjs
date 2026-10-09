import { expect, test } from '@playwright/test';

// These scenarios are phone touch layouts, including when the surrounding
// suite also runs a desktop profile for other reflow checks.
test.use({ hasTouch: true, isMobile: true });

const owner = 'person-landscape-owner';
const eventId = 'event-landscape-proportions';
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: 'בודק פרופורציות', kind: 'user', avatarPreset: 'avatar-1' }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: eventId, name: 'סופ״ש Lisbon 2026 · משפחת כהן', eventType: 'trip', currency: 'ILS',
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: '2026-10-09T07:00:00.000Z', updatedAt: '2026-10-09T07:00:00.000Z',
    roundSettlementTransfers: true, expenses: [], transfers: [], activityLog: [] }]
};

test.beforeEach(async ({ page, request }, testInfo) => {
  await request.post('/api/reset');
  await request.put('/api/state', { data: state });
  await page.addInitScript(({ owner, state }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(state));
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({ participantId: owner, displayName: 'בודק פרופורציות', avatarPreset: 'avatar-1' }));
    localStorage.setItem('settle-friends-current-participant', owner);
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  }, { owner, state });
  const size = testInfo.project.metadata?.dynamicTypePreview;
  await page.goto(size ? `/?dynamic-type-preview=${size}` : '/');
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
});

async function recordGeometry(page, target, label, testInfo) {
  await page.evaluate(() => document.fonts.ready);
  await expect(target).toBeVisible();
  await page.waitForTimeout(100);
  const geometry = await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const body = element.closest('.expense-flow-body');
    const clip = body?.getBoundingClientRect();
    const nav = [...document.querySelectorAll('.product-app-nav')].find(node => node.getBoundingClientRect().height > 0);
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, height: rect.height,
      viewportHeight: innerHeight, clipTop: clip?.top ?? 0,
      clipBottom: clip?.bottom ?? nav?.getBoundingClientRect().top ?? innerHeight,
      receivesTap: element === hit || element.contains(hit) };
  });
  await testInfo.attach(label, { contentType: 'application/json', body: JSON.stringify(geometry) });
  await page.screenshot({ path: testInfo.outputPath(`${label}.png`) });
  return geometry;
}

for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`landscape home keeps its friends shortcut available on opening ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const friends = page.locator('[data-action="groups"]').first();
    const geometry = await recordGeometry(page, friends, `home-${viewport.width}`, testInfo);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom, 'home shortcuts must fit above the fixed navigation when the screen opens').toBeLessThanOrEqual(geometry.clipBottom + 1);
    expect(geometry.receivesTap).toBe(true);
    const create = page.locator('.home-create-event-action');
    const createGeometry = await recordGeometry(page, create, `home-create-${viewport.width}`, testInfo);
    expect(createGeometry.height).toBeGreaterThanOrEqual(44);
    expect(createGeometry.bottom).toBeLessThanOrEqual(createGeometry.clipBottom + 1);
    expect(createGeometry.receivesTap).toBe(true);
    const placement = await create.evaluate(element => {
      const screen = element.closest('.screen');
      const hero = screen.querySelector(':scope > .top').getBoundingClientRect();
      const copy = screen.querySelector(':scope > .top .brand').getBoundingClientRect();
      const button = element.getBoundingClientRect();
      return { edgeOffset: Math.abs((button.top + button.bottom) / 2 - hero.bottom), copyGap: button.top - copy.bottom };
    });
    await testInfo.attach(`home-edge-${viewport.width}`, { contentType: 'application/json', body: JSON.stringify(placement) });
    expect(placement.edgeOffset).toBeLessThanOrEqual(3);
    expect(placement.copyGap).toBeGreaterThanOrEqual(0);
  });

  test(`landscape event keeps workspace tabs available on opening ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const [index, tab] of (await page.locator('.event-workspace-nav .event-workspace-tab').all()).entries()) {
      const geometry = await recordGeometry(page, tab, `event-${viewport.width}-${index}`, testInfo);
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom, 'workspace tabs must fit above the fixed navigation without an initial scroll').toBeLessThanOrEqual(geometry.clipBottom + 1);
      expect(geometry.receivesTap).toBe(true);
    }
  });

  test(`landscape expense shows the full amount input on opening ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await page.locator('[data-action="show-expense-form"]').first().click();
    const total = page.locator('[data-action="expense-total"]');
    const geometry = await recordGeometry(page, total, `amount-${viewport.width}`, testInfo);
    expect(geometry.height, 'the amount input must retain a full touch target').toBeGreaterThanOrEqual(44);
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.clipTop - 1);
    expect(geometry.bottom, 'the amount must be fully visible above the fixed action footer on opening').toBeLessThanOrEqual(geometry.clipBottom + 1);
    expect(geometry.receivesTap).toBe(true);
    await total.fill('120');
    await expect(total).toHaveValue('120');
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 664 }]) {
  test(`portrait notes keeps the first note action available on opening ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await page.locator('[data-action="open-event-notes"]').click();
    await expect(page.locator('[data-screen-kind="event-notes"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const action = page.locator('[data-action="new-event-note"]');
    const geometry = await recordGeometry(page, action, `portrait-notes-${viewport.width}`, testInfo);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom, 'a long event title must leave room for the first notes action above navigation').toBeLessThanOrEqual(geometry.clipBottom + 1);
    expect(geometry.receivesTap).toBe(true);
    for (const tab of await page.locator('.event-workspace-tab').all()) {
      const fits = await tab.evaluate(element => {
        const button = element.getBoundingClientRect();
        const label = element.querySelector('strong').getBoundingClientRect();
        return label.left >= button.left && label.right <= button.right;
      });
      expect(fits, 'workspace labels must remain whole inside their touch targets').toBe(true);
    }
    await action.click();
    await expect(page.locator('.event-note-modal')).toBeVisible();
  });
}
