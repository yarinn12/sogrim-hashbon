import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const owner = 'person-keyboard-footer';
const event = 'event-keyboard-footer';
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: 'בודק מקלדת', kind: 'user', avatarPreset: 'avatar-1' }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: event, name: 'בדיקת שדה מעל כפתור', currency: 'ILS',
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z',
    expenses: [], transfers: [], activityLog: [] }]
};

for (const font of [16, 37.64706]) {
  test(`focused expense name stays above the sticky footer after keyboard changes (${font}px)`, async ({ page, request }, testInfo) => {
    // Browser boundary reproduction of the captured UIKit failure, not Native
    // acceptance: the layout viewport remains tall while visualViewport shrinks.
    await page.setViewportSize({ width: 393, height: 793 });
    await request.post('/api/reset');
    await request.put('/api/state', { data: state });
    await page.addInitScript(({ state, owner }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('settle-friends-state', JSON.stringify(state));
      localStorage.setItem('settle-friends-local-profile', JSON.stringify({
        participantId: owner, displayName: 'בודק מקלדת', avatarPreset: 'avatar-1'
      }));
      localStorage.setItem('settle-friends-current-participant', owner);
      sessionStorage.setItem('settle-friends-skip-next-splash', '1');
      const viewport = new EventTarget();
      Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      window.__setExpenseKeyboardHeight = height => {
        viewport.height = height;
        viewport.dispatchEvent(new Event('resize'));
      };
    }, { state, owner });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    expect(await page.evaluate(async () => {
      const faces = await Promise.all([400, 500, 600, 700].map(weight =>
        document.fonts.load(`${weight} 16px Rubik`, 'שם ההוצאה')));
      return faces.every(loaded => loaded.some(face => face.status === 'loaded'));
    }), 'the actual Hebrew font is loaded before measuring the field').toBe(true);
    await page.locator(`[data-action="open-event"][data-event-id="${event}"]`).first().click();
    if (font !== 16) await page.evaluate(font => {
      const root = document.documentElement;
      // Explicit CSS boundary fixture only: no Capacitor/OS bridge is mocked.
      root.classList.add('dynamic-type-active', 'dynamic-type-apple', 'dynamic-type-extra-large');
      root.style.setProperty('--apple-font-scale', String(40 / 17));
      root.style.setProperty('font-size', `${font}px`, 'important');
    }, font);
    await page.locator('[data-action="show-expense-form"]').first().click();
    await expect.poll(() => page.locator('html').evaluate(root => parseFloat(getComputedStyle(root).fontSize))).toBeCloseTo(font, 3);
    await page.locator('[data-action="expense-total"]').fill('120');
    await page.evaluate(() => window.__setExpenseKeyboardHeight(417));
    await expect(page.locator('html')).toHaveClass(/app-software-keyboard-open/);
    await page.locator('[data-action="expense-step-next"]').click();
    const name = page.locator('[data-action="expense-name"]');
    await expect(name).toBeFocused();
    // Headless engines expose zero env() safe insets; reserve the actual 59px
    // top and 34px bottom from the failing iPhone report in the real controls.
    await page.evaluate(() => {
      const modal = document.querySelector('.expense-step-modal');
      const header = modal.querySelector('.expense-modal-step-header');
      header.style.setProperty('padding-top', `${parseFloat(getComputedStyle(header).paddingTop) + 59}px`, 'important');
      modal.querySelector('.expense-modal-actions').style.setProperty('padding-bottom', '34px', 'important');
      modal.scrollTop = 0;
      window.__setExpenseKeyboardHeight(390);
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await testInfo.attach('initial-keyboard-footer-controls', {
      body: JSON.stringify(await readControls(page), null, 2), contentType: 'application/json'
    });
    await expect.poll(() => readControls(page), {
      message: 'the complete focused name and Next must be reachable without footer or status-bar overlap'
    }).toMatchObject({ focused: true, nameSafe: true, nameHittable: true, nextHittable: true });
    // Late content/font layout can grow after the keyboard resize. The visual
    // viewport, focus and input remain unchanged: observe the real body box.
    await page.locator('.expense-flow-body').evaluate(body => {
      body.style.setProperty('padding-top', `${parseFloat(getComputedStyle(body).paddingTop) + 80}px`, 'important');
    });
    await expect.poll(() => readControls(page), {
      message: 'late layout growth must not cover the already focused name'
    }).toMatchObject({ focused: true, nameSafe: true, nameHittable: true, nextHittable: true });
    await page.keyboard.type('בדיקת שם');
    await expect(name).toHaveValue('בדיקת שם');
    const typed = await readControls(page);
    // Input schedules the product correction on its next animation frame.
    // Compare stable samples after that callback rather than its pending state.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const first = await readControls(page);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const settled = await readControls(page);
    await testInfo.attach('keyboard-footer-controls', {
      body: JSON.stringify({ typed, first, settled }, null, 2), contentType: 'application/json'
    });
    expect(first).toMatchObject({ focused: true, nameSafe: true, nameHittable: true, nextHittable: true });
    expect(settled).toMatchObject({ focused: true, nameSafe: true, nameHittable: true, nextHittable: true });
    expect(settled.scrollTop).toBeCloseTo(first.scrollTop, 0);
    await page.locator('[data-action="expense-step-next"]').click();
    await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step', 'payer');
  });
}

async function readControls(page) {
  return page.evaluate(() => {
    const name = document.querySelector('[data-action="expense-name"]');
    const next = document.querySelector('[data-action="expense-step-next"]');
    const modal = name.closest('.expense-step-modal');
    const rect = name.getBoundingClientRect();
    const footer = modal.querySelector('.expense-modal-actions').getBoundingClientRect();
    const header = modal.querySelector('.expense-modal-step-header');
    const headerRect = header.getBoundingClientRect();
    const headerStyle = getComputedStyle(header);
    const safeTop = Math.max(63, parseFloat(headerStyle.paddingTop) + 4,
      headerStyle.position === 'sticky' ? headerRect.bottom + 4 : 0);
    const hit = element => {
      const box = element.getBoundingClientRect();
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return Boolean(target && (target === element || element.contains(target)));
    };
    return { focused: document.activeElement === name, nameTop: rect.top, nameBottom: rect.bottom,
      footerTop: footer.top, scrollTop: modal.scrollTop,
      scrollHeight: modal.scrollHeight, clientHeight: modal.clientHeight,
      fieldHeight: rect.height,
      headerBottom: headerRect.bottom, headerPosition: headerStyle.position,
      headerPadding: headerStyle.paddingTop, safeTop,
      rootFont: getComputedStyle(document.documentElement).fontSize,
      hitTarget: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.outerHTML.slice(0, 220),
      nameSafe: rect.top >= safeTop && rect.bottom <= Math.min(visualViewport.height, footer.top) - 8,
      nameHittable: hit(name), nextHittable: hit(next) };
  });
}
