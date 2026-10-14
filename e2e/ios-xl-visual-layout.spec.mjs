import { expect, test } from '@playwright/test';
import { openRenderedHome } from './helpers/typographyReadiness.mjs';

test.use({ serviceWorkers: 'block' });

const OWNER = 'person-ios-xl-layout';
const EVENT = 'event-ios-xl-layout';
const state = {
  currentParticipantId: OWNER,
  participants: [{ id: OWNER, displayName: 'בודקת פריסה', kind: 'user', avatarPreset: 'avatar-1' }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: EVENT, name: 'אירוע בדיקת פריסה', eventType: 'trip', currency: 'ILS',
    participantIds: [OWNER], adminIds: [OWNER], createdByParticipantId: OWNER,
    createdAt: '2026-10-11T08:00:00.000Z', updatedAt: '2026-10-11T08:00:00.000Z',
    roundSettlementTransfers: true, locked: false, transfers: [], activityLog: [],
    expenses: [{
      id: 'expense-ios-xl-layout', name: 'QA iOS', total: 12000,
      payers: [{ participantId: OWNER, amount: 12000 }],
      sharedByParticipantIds: [OWNER], createdByParticipantId: OWNER,
      occurredOn: '2026-10-11', updatedAt: '2026-10-11T08:00:00.000Z'
    }]
  }]
};

test.beforeEach(async ({ page, request }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await request.post('/api/reset');
  await request.put('/api/state', { data: state });
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(state));
    localStorage.setItem('settle-friends-current-participant', owner);
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({
      participantId: owner, displayName: 'בודקת פריסה', avatarPreset: 'avatar-1'
    }));
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
    // Browser boundary fixture: iOS keeps its layout viewport while the real
    // keyboard reduces visualViewport to 449 CSS pixels.
    const viewport = new EventTarget();
    Object.assign(viewport, {
      width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.__setLayoutKeyboardHeight = height => {
      viewport.height = height;
      viewport.dispatchEvent(new Event('resize'));
    };
  }, { state, owner: OWNER });
});

async function openAtSize(page, mode) {
  await openRenderedHome(page, {
    path: mode === '32' ? '/?dynamic-type-preview=32' : '/',
    bootTimeoutMs: 15_000,
    readyTimeoutMs: 8_000
  });
  if (mode === 'AX') {
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.add('native-app', 'dynamic-type-active', 'dynamic-type-apple', 'dynamic-type-extra-large');
      root.style.setProperty('--apple-font-scale', String(40 / 17));
      root.style.setProperty('font-size', '37.64706px', 'important');
    });
  }
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
  await expect(page.locator('.screen[data-screen-kind="event"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const mode of ['normal', '32', 'AX']) {
  test(`trip group amount stays intact and reflows at ${mode} text size`, async ({ page }, testInfo) => {
    await openAtSize(page, mode);
    const geometry = await page.locator('.expense-day-heading').first().evaluate(heading => {
      const amount = heading.querySelector('.expense-day-summary .amount .font-num');
      const text = amount.firstChild;
      const glyphs = Array.from(text.textContent, (_, index) => {
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const rect = range.getBoundingClientRect();
        return { character: text.textContent[index], top: rect.top, left: rect.left, right: rect.right };
      });
      const headerBox = heading.getBoundingClientRect();
      const amountBox = amount.getBoundingClientRect();
      return {
        rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
        amountFont: parseFloat(getComputedStyle(amount).fontSize),
        text: amount.textContent,
        glyphs,
        header: { left: headerBox.left, right: headerBox.right },
        amount: { left: amountBox.left, right: amountBox.right }
      };
    });
    await testInfo.attach('group-amount-geometry', {
      body: JSON.stringify({ mode, geometry }, null, 2), contentType: 'application/json'
    });
    expect(geometry.text).toContain('120.00');
    expect(geometry.rootFont).toBeCloseTo(mode === 'normal' ? 16 : mode === '32' ? 32 : 37.64706, 3);
    expect(new Set(geometry.glyphs.map(glyph => Math.round(glyph.top))).size,
      `the entire ${geometry.text} amount must occupy one line`).toBe(1);
    expect(geometry.amount.left).toBeGreaterThanOrEqual(geometry.header.left - 1);
    expect(geometry.amount.right).toBeLessThanOrEqual(geometry.header.right + 1);
    if (mode === 'AX') {
      await page.locator('.expense-day-heading').first().scrollIntoViewIfNeeded();
      await testInfo.attach('group-amount-AX', {
        body: await page.screenshot(), contentType: 'image/png'
      });
    }
  });

  test(`keyboard name keeps navigation reachable below the safe area at ${mode} text size`, async ({ page }, testInfo) => {
    await openAtSize(page, mode);
    await page.evaluate(() => {
      // Headless engines have zero env() insets. The source UIKit capture has
      // a 59px safe-area top; this CSS variable models that boundary.
      document.documentElement.style.setProperty('--app-keyboard-safe-area-top', '59px');
    });
    await page.locator('[data-action="show-expense-form"]').first().click();
    await page.locator('[data-action="expense-total"]').fill('120');
    await page.evaluate(() => window.__setLayoutKeyboardHeight(449));
    await expect(page.locator('html')).toHaveClass(/app-software-keyboard-open/);
    await page.locator('[data-action="expense-step-next"]').click();
    const name = page.locator('[data-action="expense-name"]');
    await expect(name).toBeFocused();
    await page.locator('.expense-modal-step-header').evaluate(header => {
      // env(safe-area-inset-top) is zero in headless engines; UIKit supplied
      // another 59px of header padding in the captured AX keyboard layout.
      header.style.setProperty('padding-top',
        `${parseFloat(getComputedStyle(header).paddingTop) + 59}px`, 'important');
    });
    await name.fill('QA iOS');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const geometry = await page.evaluate(() => {
      const modal = document.querySelector('.expense-step-modal');
      const bounds = selector => {
        const element = modal.querySelector(selector);
        const box = element.getBoundingClientRect();
        const atCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { top: box.top, bottom: box.bottom,
          hittable: Boolean(atCenter && (atCenter === element || element.contains(atCenter))) };
      };
      return {
        rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
        modal: bounds('.expense-modal-step-header'),
        scrollport: { top: modal.getBoundingClientRect().top, scrollTop: modal.scrollTop },
        back: bounds('[data-action="expense-step-back"]'),
        accessibility: bounds('.expense-accessibility-button'),
        name: bounds('[data-action="expense-name"]'),
        next: bounds('[data-action="expense-step-next"]'),
        viewportHeight: visualViewport.height
      };
    });
    await testInfo.attach('keyboard-navigation-geometry', {
      body: JSON.stringify({ mode, geometry }, null, 2), contentType: 'application/json'
    });
    expect(geometry.rootFont).toBeCloseTo(mode === 'normal' ? 16 : mode === '32' ? 32 : 37.64706, 3);
    // The title may scroll to make room for the field. The modal must clip it
    // below the status bar while Back and Accessibility stay operable.
    expect(geometry.scrollport.top).toBeGreaterThanOrEqual(59);
    for (const key of ['back', 'accessibility', 'name', 'next']) {
      expect(geometry[key].top, `${key} top`).toBeGreaterThanOrEqual(59);
      expect(geometry[key].bottom, `${key} bottom`).toBeLessThanOrEqual(geometry.viewportHeight);
      expect(geometry[key].hittable, `${key} hit target`).toBe(true);
    }
    if (mode === 'AX') {
      await testInfo.attach('keyboard-name-AX', {
        body: await page.screenshot(), contentType: 'image/png'
      });
    }
    // Queue the real input and layout observers before the user's scroll-to-top
    // intent. The keyboard reveal must not replay a stale scroll on the next
    // frame and hide the title again.
    const scrollIntent = await page.locator('.expense-step-modal').evaluate(modal => {
      const header = modal.querySelector('.expense-modal-step-header');
      const name = modal.querySelector('[data-action="expense-name"]');
      header.style.setProperty('padding-top',
        `${parseFloat(getComputedStyle(header).paddingTop) + 1}px`, 'important');
      name.dispatchEvent(new Event('input', { bubbles: true }));
      modal.scrollTop = 0;
      const bounds = selector => {
        const box = modal.querySelector(selector).getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      };
      return { scrollTop: modal.scrollTop,
        heading: bounds('#expense-modal-title'),
        eyebrow: bounds('.expense-modal-step-header .eyebrow') };
    });
    await testInfo.attach('keyboard-scroll-intent', {
      body: JSON.stringify({ mode, scrollIntent }, null, 2), contentType: 'application/json'
    });
    expect(scrollIntent.scrollTop).toBe(0);
    for (const target of [scrollIntent.heading, scrollIntent.eyebrow]) {
      expect(target.top).toBeGreaterThanOrEqual(115);
      expect(target.bottom).toBeLessThanOrEqual(449);
    }
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const heading = await page.locator('#expense-modal-title').boundingBox();
    const step = await page.locator('.expense-modal-step-header .eyebrow').boundingBox();
    expect(heading.y).toBeGreaterThanOrEqual(115);
    expect(heading.y + heading.height).toBeLessThanOrEqual(449);
    expect(step.y).toBeGreaterThanOrEqual(115);
    expect(step.y + step.height).toBeLessThanOrEqual(449);
    if (testInfo.project.name === 'desktop-webkit') {
      // Desktop WebKit accepts real wheel input at this mobile canvas width;
      // mobile WebKit's Playwright wheel API is unsupported. Exercise both
      // routes without substituting a synthetic wheel event for a user action.
      const modal = page.locator('.expense-step-modal');
      await modal.evaluate((node, scrollTop) => {
        node.scrollTop = Math.max(200, scrollTop);
      }, geometry.scrollport.scrollTop);
      const box = await modal.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 180));
      await page.mouse.wheel(0, -900);
      await page.evaluate(() => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const wheelHeading = await page.locator('#expense-modal-title').boundingBox();
      const wheelStep = await page.locator('.expense-modal-step-header .eyebrow').boundingBox();
      expect(wheelHeading.y).toBeGreaterThanOrEqual(115);
      expect(wheelHeading.y + wheelHeading.height).toBeLessThanOrEqual(449);
      expect(wheelStep.y).toBeGreaterThanOrEqual(115);
      expect(wheelStep.y + wheelStep.height).toBeLessThanOrEqual(449);
    }
    const nextFramePair = () => page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const assertFreshReveal = async label => {
      await nextFramePair();
      const refreshed = await page.evaluate(() => {
        const modal = document.querySelector('.expense-step-modal');
        const bounds = selector => {
          const element = modal.querySelector(selector);
          const box = element.getBoundingClientRect();
          const atCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return { top: box.top, bottom: box.bottom,
            hittable: Boolean(atCenter && (atCenter === element || element.contains(atCenter))) };
        };
        return { scrollTop: modal.scrollTop,
          back: bounds('[data-action="expense-step-back"]'),
          accessibility: bounds('.expense-accessibility-button'),
          name: bounds('[data-action="expense-name"]'),
          next: bounds('[data-action="expense-step-next"]') };
      });
      await testInfo.attach(`keyboard-fresh-${label}`, {
        body: JSON.stringify({ mode, refreshed }, null, 2), contentType: 'application/json'
      });
      for (const key of ['back', 'accessibility', 'name', 'next']) {
        expect(refreshed[key].top, `${label}: ${key} top`).toBeGreaterThanOrEqual(59);
        expect(refreshed[key].bottom, `${label}: ${key} bottom`).toBeLessThanOrEqual(449);
        expect(refreshed[key].hittable, `${label}: ${key} hit target`).toBe(true);
      }
    };
    const scrollBackToTitle = async () => {
      await page.locator('.expense-step-modal').evaluate(modal => { modal.scrollTop = 0; });
      await nextFramePair();
      const title = await page.locator('#expense-modal-title').boundingBox();
      const eyebrow = await page.locator('.expense-modal-step-header .eyebrow').boundingBox();
      for (const target of [title, eyebrow]) {
        expect(target.y).toBeGreaterThanOrEqual(115);
        expect(target.y + target.height).toBeLessThanOrEqual(449);
      }
    };
    // A later editing, viewport or focus action is newer than the reader's
    // scroll intent and must bring the focused field back into the safe area.
    await page.evaluate(() => {
      const field = document.querySelector('[data-action="expense-name"]');
      field.value += ' x';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await assertFreshReveal('input');
    await scrollBackToTitle();
    await page.evaluate(() => window.__setLayoutKeyboardHeight(449));
    await assertFreshReveal('viewport');
    await scrollBackToTitle();
    await page.evaluate(() => {
      const field = document.querySelector('[data-action="expense-name"]');
      field.blur();
      field.focus();
    });
    await assertFreshReveal('focus');
    const alreadyVisible = await page.locator('.expense-step-modal').evaluate(modal => {
      const field = modal.querySelector('[data-action="expense-name"]');
      const bounds = field.getBoundingClientRect();
      const actionTop = modal.querySelector('.expense-modal-actions').getBoundingClientRect().top;
      return { scrollTop: modal.scrollTop, fieldTop: bounds.top, fieldBottom: bounds.bottom,
        actionTop };
    });
    expect(alreadyVisible.fieldTop).toBeGreaterThanOrEqual(115);
    expect(alreadyVisible.fieldBottom).toBeLessThanOrEqual(alreadyVisible.actionTop - 8);
    await page.evaluate(() => window.__setLayoutKeyboardHeight(449));
    await nextFramePair();
    const retainedScrollTop = await page.locator('.expense-step-modal').evaluate(modal => modal.scrollTop);
    expect(retainedScrollTop, 'a visible focused name keeps its scroll position').toBeCloseTo(
      alreadyVisible.scrollTop, 0);
    await page.locator('[data-action="expense-step-back"]').click();
    await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step', 'amount');
  });
}

for (const mode of ['normal', '32', 'AX']) {
  test(`native-size amount keyboard keeps controls reachable and title whole at ${mode} text size`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 393, height: 793 });
    await openAtSize(page, mode);
    await page.evaluate(() => {
      document.documentElement.classList.add('native-app');
      document.documentElement.style.setProperty('--app-keyboard-safe-area-top', '59px');
    });
    await page.locator('[data-action="show-expense-form"]').first().click();
    await page.locator('[data-action="expense-total"]').focus();
    await page.evaluate(() => window.__setLayoutKeyboardHeight(417));
    await expect(page.locator('html')).toHaveClass(/app-software-keyboard-open/);
    await page.evaluate(async () => {
      const backdrop = document.querySelector('.expense-step-route-backdrop');
      const modal = backdrop.querySelector('.expense-step-modal');
      await Promise.all([backdrop, modal].flatMap(element => element.getAnimations()).filter(animation =>
        animation.playState === 'running' && Number.isFinite(animation.effect.getComputedTiming().endTime)
      ).map(animation => animation.finished.catch(() => {})));
    });
    await page.locator('.expense-step-modal').evaluate(modal => { modal.scrollTop = Math.max(102, modal.scrollTop); });
    await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize')));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const geometry = await page.evaluate(() => {
      const modal = document.querySelector('.expense-step-modal');
      const bounds = element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { top: rect.top, bottom: rect.bottom,
          hittable: hit === element || element.contains(hit) };
      };
      const controls = [...modal.querySelectorAll('.expense-accessibility-button, .modal-section-back-button')];
      const controlBounds = controls.map(bounds);
      const field = bounds(modal.querySelector('[data-action="expense-total"]'));
      const next = bounds(modal.querySelector('[data-action="expense-step-next"]'));
      const header = modal.querySelector('.expense-modal-step-header');
      const title = modal.querySelector('#expense-modal-title');
      const titleRange = document.createRange();
      titleRange.selectNodeContents(title);
      const titleRects = [...titleRange.getClientRects()].map(rect => ({ top: rect.top, bottom: rect.bottom }));
      const coverStyle = getComputedStyle(header, '::after');
      const cover = {
        top: parseFloat(coverStyle.top),
        bottom: parseFloat(coverStyle.top) + parseFloat(coverStyle.height),
        background: coverStyle.backgroundColor
      };
      const probe = document.createElement('style');
      // The white cover ignores pointer events in production. Enable hit
      // testing just for this probe so the top painted layer is observable.
      probe.textContent = ':is(.expense-step-route-backdrop, .expense-step-modal .expense-modal-step-header)::after { pointer-events: auto !important; }';
      document.head.append(probe);
      const result = {
        rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
        viewport: { layout: innerHeight, visual: visualViewport.height },
        modalTop: modal.getBoundingClientRect().top,
        scrollTop: modal.scrollTop,
        field, next, cover, titleRects,
        controls: controls.map((control, index) => {
          const rect = control.getBoundingClientRect();
          const paintedTop = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return { ...controlBounds[index],
            visibleAboveCover: paintedTop === control || control.contains(paintedTop),
            paintedTop: paintedTop?.className || paintedTop?.tagName };
        })
      };
      probe.remove();
      return result;
    });
    await testInfo.attach('native-size-keyboard-controls', {
      body: JSON.stringify({ mode, geometry }, null, 2), contentType: 'application/json'
    });
    await testInfo.attach('native-size-keyboard-screenshot', {
      body: await page.screenshot(), contentType: 'image/png'
    });
    expect(geometry.rootFont).toBeCloseTo(mode === 'normal' ? 16 : mode === '32' ? 32 : 37.64706, 3);
    expect(geometry.viewport).toEqual({ layout: 793, visual: 417 });
    expect(geometry.modalTop).toBeGreaterThanOrEqual(59);
    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(geometry.cover.background).toBe('rgb(255, 255, 255)');
    expect(geometry.titleRects.length).toBeGreaterThan(0);
    for (const rect of geometry.titleRects) {
      const visibleTop = Math.max(rect.top, geometry.modalTop);
      const visibleBottom = Math.min(rect.bottom, geometry.viewport.visual);
      const aboveCover = Math.max(0, Math.min(visibleBottom, geometry.cover.top) - visibleTop);
      const belowCover = Math.max(0, visibleBottom - Math.max(visibleTop, geometry.cover.bottom));
      const paintedHeight = aboveCover + belowCover;
      expect(paintedHeight < 0.5 || paintedHeight >= rect.bottom - rect.top - 0.5,
        `title line ${JSON.stringify(rect)} is only partly painted outside the white cover ${JSON.stringify(geometry.cover)}; paintedHeight ${paintedHeight}`
      ).toBe(true);
    }
    expect(geometry.controls).toHaveLength(2);
    for (const control of [...geometry.controls, geometry.field, geometry.next]) {
      expect(control.top).toBeGreaterThanOrEqual(59);
      expect(control.bottom).toBeLessThanOrEqual(417);
      expect(control.hittable).toBe(true);
    }
    for (const control of geometry.controls) {
      expect(control.visibleAboveCover, `control is hidden by ${control.paintedTop}`).toBe(true);
    }
    await page.locator('.expense-step-modal').evaluate(modal => { modal.scrollTop = 0; });
    const readableTitle = await page.locator('#expense-modal-title').evaluate(title => {
      const range = document.createRange();
      range.selectNodeContents(title);
      return [...range.getClientRects()].map(rect => ({ top: rect.top, bottom: rect.bottom }));
    });
    expect(readableTitle.length).toBeGreaterThan(0);
    for (const rect of readableTitle) {
      expect(rect.top, `title line ${JSON.stringify(rect)} must be readable after scrolling back`).toBeGreaterThanOrEqual(geometry.cover.bottom);
      if (mode !== 'AX') expect(rect.bottom).toBeLessThanOrEqual(geometry.viewport.visual);
    }
    await testInfo.attach('native-size-title-after-scrollback', {
      body: await page.screenshot(), contentType: 'image/png'
    });
    await page.locator('.expense-accessibility-button').click();
    await expect(page.locator('.accessibility-center[role="dialog"]')).toBeVisible();
    await page.locator('[data-close-accessibility]').first().click();
    await expect(page.locator('.accessibility-center')).toBeHidden();
    await page.locator('[data-action="cancel-expense"]').click();
    await expect(page.locator('.expense-step-modal')).toBeHidden();
  });
}
