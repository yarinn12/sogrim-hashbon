import { expect, test } from '@playwright/test';
import { calculateSettlement } from '../src/domain/settlement.mjs';

const owner = 'person-typography-geometry-owner';
const peers = [
  'person-typography-geometry-one',
  'person-typography-geometry-two',
  'person-typography-geometry-three'
];
const eventId = 'event-typography-geometry';
const participants = [owner, ...peers].map((id, index) => ({
  id, displayName: `בודק טיפוגרפיה ${index + 1}`, kind: 'guest'
}));
const expenses = [
  { id: 'geometry-dinner', name: 'ארוחה', total: 24000,
    payers: [{ participantId: owner, amount: 24000 }],
    sharedByParticipantIds: participants.map(person => person.id),
    createdByParticipantId: owner, occurredOn: '2026-10-01', updatedAt: '2026-10-01T08:00:00.000Z' },
  { id: 'geometry-taxi', name: 'נסיעה', total: 7600,
    payers: [{ participantId: peers[0], amount: 7600 }],
    sharedByParticipantIds: [owner, peers[0], peers[1]],
    createdByParticipantId: peers[0], occurredOn: '2026-10-01', updatedAt: '2026-10-01T08:00:00.000Z' }
];
const transfers = calculateSettlement(participants, expenses, { roundTransfers: true })
  .transfers.map(transfer => ({ ...transfer, status: 'pending' }));
const state = {
  currentParticipantId: owner, participants, friendContacts: [], groups: [],
  deletedEvents: [], deletedParticipants: [],
  events: [{ id: eventId, name: 'אירוע בדיקת גובה שורה', eventType: 'trip', currency: 'ILS',
    participantIds: participants.map(person => person.id), adminIds: [owner],
    createdByParticipantId: owner, createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z', roundSettlementTransfers: true,
    expenses, transfers, activityLog: [] }]
};

test('summary and header text grow with system text and leave long copy readable', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await request.post('/api/reset');
  await request.put('/api/state', { data: state });
  await page.addInitScript(({ ownerId, initialState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(initialState));
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({
      participantId: ownerId, displayName: 'בודק טיפוגרפיה 1'
    }));
    localStorage.setItem('settle-friends-current-participant', ownerId);
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  }, { ownerId: owner, initialState: state });

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();
  const summary = page.locator('.screen[data-event-view="summary"]');
  await expect(summary).toBeVisible();
  const hero = summary.locator('.settlement-hero.is-personal-pending:not(.is-explained)');
  await expect(hero).toBeVisible();
  const description = hero.locator('.settlement-hero-title-row .muted');
  await expect(description).toContainText('אפשר לראות את המצב כרגע');
  await expect(description).toHaveCSS('font-size', '12px');
  const status = hero.locator('.status-chip');
  const heading = hero.locator('.settlement-hero-title-row h2');
  const firstTransfer = summary.locator('.settlement-transfer-board .transfer-row').first();
  const badge = firstTransfer.locator('.personal-transfer-badge');
  const name = firstTransfer.locator('.transfer-participant-copy strong').first();
  const amount = firstTransfer.locator('.transfer-amount > .amount');
  const debt = firstTransfer.locator('.transfer-debt-summary');
  const explanationLabel = firstTransfer.locator('.transfer-equation-item > span').first();
  // Use the named action: DOM order can change when compact route controls move.
  const headerLabel = summary.locator('[data-action="open-event-participants"] .event-header-action-label');
  const brand = page.locator('.product-brand-copy strong').first();
  await expect(status).toHaveCSS('font-size', '11px');
  await expect(badge).toHaveCSS('font-size', '11px');
  await expect(name).toHaveCSS('font-size', '14px');
  await expect(amount).toHaveCSS('font-size', '20px');
  await expect(debt).toHaveCSS('font-size', '14px');
  await expect(explanationLabel).toHaveCSS('font-size', '10px');
  await expect(headerLabel).toHaveCSS('font-size', '11.5px');
  await expect(brand).toHaveCSS('font-size', '17px');

  await page.evaluate(() => {
    document.documentElement.classList.add('dynamic-type-preview');
    document.documentElement.style.setProperty('font-size', '32px', 'important');
  });
  await expect(description).toHaveCSS('font-size', '24px');
  await expect(status).toHaveCSS('font-size', '22px');
  expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(35);
  await expect(badge).toHaveCSS('font-size', '22px');
  await expect(name).toHaveCSS('font-size', '28px');
  await expect(amount).toHaveCSS('font-size', '40px');
  await expect(debt).toHaveCSS('font-size', '28px');
  await expect(explanationLabel).toHaveCSS('font-size', '20px');
  await expect(headerLabel).toHaveCSS('font-size', '32px');
  await expect(brand).toHaveCSS('font-size', '34px');
  const headerLayout = await summary.evaluate(screen => {
    const mark = screen.querySelector('.product-brand-mark').getBoundingClientRect();
    const brand = screen.querySelector('.product-brand-copy strong').getBoundingClientRect();
    const labelsFit = [...screen.querySelectorAll('.event-header-action-label')]
      .every(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const glyphs = [...range.getClientRects()];
        const button = element.closest('button').getBoundingClientRect();
        return glyphs.every(label => label.left >= button.left - 1 && label.right <= button.right + 1
          && label.top >= button.top - 1 && label.bottom <= button.bottom + 1);
      });
    return { markBottom: mark.bottom, brandTop: brand.top, labelsFit };
  });
  expect(headerLayout.brandTop).toBeGreaterThanOrEqual(headerLayout.markBottom - 1);
  expect(headerLayout.labelsFit).toBe(true);

  const longCopy = 'אפשר לראות את המצב כרגע. מעבירים כסף רק לאחר סגירת האירוע. '.repeat(4).trim();
  await description.evaluate((element, text) => { element.textContent = text; }, longCopy);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await description.evaluate(element => {
    const text = element.firstChild;
    const last = document.createRange();
    last.setStart(text, text.length - 1);
    last.setEnd(text, text.length);
    const inkBottom = last.getBoundingClientRect().bottom;
    const box = element.getBoundingClientRect();
    const card = element.closest('.settlement-hero').getBoundingClientRect();
    const actions = element.closest('.settlement-hero').querySelector('.settlement-hero-actions').getBoundingClientRect();
    return { fontSize: parseFloat(getComputedStyle(element).fontSize),
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      inkBottom, boxBottom: box.bottom, cardBottom: card.bottom, actionsTop: actions.top,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth };
  });
  expect(layout.fontSize).toBe(24);
  expect(layout.inkBottom).toBeLessThanOrEqual(layout.boxBottom + 1);
  expect(layout.inkBottom).toBeLessThan(layout.actionsTop);
  expect(layout.inkBottom).toBeLessThan(layout.cardBottom);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1);

  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '37.64706px', 'important'));
  expect(await headerLabel.evaluate(element => parseFloat(getComputedStyle(element).fontSize)))
    .toBeCloseTo(37.64706, 2);
  const extraLargeSize = await description.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(extraLargeSize).toBeCloseTo(12 * 37.64706 / 16, 2);
  const extraLargeLayout = await description.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const ink = range.getBoundingClientRect();
    const card = element.closest('.settlement-hero').getBoundingClientRect();
    return { inkBottom: ink.bottom, cardBottom: card.bottom,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth };
  });
  expect(extraLargeLayout.inkBottom).toBeLessThan(extraLargeLayout.cardBottom);
  expect(extraLargeLayout.scrollHeight).toBeLessThanOrEqual(extraLargeLayout.clientHeight + 1);
  expect(extraLargeLayout.documentScrollWidth).toBeLessThanOrEqual(extraLargeLayout.documentClientWidth + 1);
  const extraLargeLabelsFit = await summary.evaluate(screen =>
    [...screen.querySelectorAll('.event-header-action-label')].every(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const glyphs = [...range.getClientRects()];
      const button = element.closest('button').getBoundingClientRect();
      return glyphs.every(label => label.left >= button.left - 1 && label.right <= button.right + 1
        && label.top >= button.top - 1 && label.bottom <= button.bottom + 1);
    }));
  expect(extraLargeLabelsFit).toBe(true);
  const extraLargeTransfer = await firstTransfer.evaluate(row => {
    const card = row.getBoundingClientRect();
    const columns = getComputedStyle(row.querySelector('.transfer-people')).gridTemplateColumns.split(' ').length;
    const name = row.querySelector('.transfer-participant-copy strong bdi');
    const range = document.createRange();
    range.selectNodeContents(name);
    const glyphs = [...range.getClientRects()];
    return { columns, namesFit: glyphs.every(rect => rect.left >= card.left - 1 && rect.right <= card.right + 1) };
  });
  expect(extraLargeTransfer.columns).toBe(1);
  expect(extraLargeTransfer.namesFit).toBe(true);
  if (testInfo.project.name === 'android-mobile') {
    await page.evaluate(async () => {
      const root = document.documentElement;
      root.classList.remove('dynamic-type-preview');
      root.style.removeProperty('font-size');
      const { refreshAndroidDynamicType } = await import('/src/publicDynamicTypeLayer.mjs');
      await refreshAndroidDynamicType(root, { getPlatform: () => 'android', Plugins: {
        SogrimCapabilities: { getCapabilities: async () => ({ fontScale: 2 }) }
      } });
    });
    await expect(description).toHaveCSS('font-size', '12px');
    // Native Android uses the OS scale and its large-text class, without the
    // extra root-font preview scale that would double-apply accessibility size.
    await expect(headerLabel).toHaveCSS('font-size', '16px');
    await expect(brand).toHaveCSS('font-size', '17px');
    const androidState = await page.evaluate(() => ({
      scale: document.documentElement.style.getPropertyValue('--android-font-scale'),
      active: document.documentElement.classList.contains('dynamic-type-active'),
      extraLarge: document.documentElement.classList.contains('dynamic-type-extra-large')
    }));
    expect(androidState).toEqual({ scale: '2', active: true, extraLarge: true });
    await page.evaluate(async () => {
      const { refreshAndroidDynamicType } = await import('/src/publicDynamicTypeLayer.mjs');
      await refreshAndroidDynamicType(document.documentElement, { getPlatform: () => 'android', Plugins: {
        SogrimCapabilities: { getCapabilities: async () => ({ fontScale: 1 }) }
      } });
    });
  } else {
    await page.evaluate(() => {
      document.documentElement.classList.remove('dynamic-type-preview');
      document.documentElement.style.setProperty('font-size', '16px', 'important');
    });
  }
  await expect(description).toHaveCSS('font-size', '12px');
  await expect(status).toHaveCSS('font-size', '11px');
  await expect(headerLabel).toHaveCSS('font-size', '11.5px');
  await expect(brand).toHaveCSS('font-size', '17px');
  expect(errors).toEqual([]);
});
