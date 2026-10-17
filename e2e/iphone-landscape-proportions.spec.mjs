import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openHeldRenderedHome, requireHeldHomeReadiness } from './helpers/heldHomeReadinessControl.mjs';

requireHeldHomeReadiness(test);

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
  const size = requestedTextSize(testInfo);
  await openHeldRenderedHome(page, { path: size > 32 ? '/' : size ? `/?dynamic-type-preview=${size}` : '/' });
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  if (size > 32) {
    // The local preview intentionally clamps at 32px; emulate the iOS AX root
    // measured by the native parity suite without changing product behavior.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.add('dynamic-type-active', 'dynamic-type-apple', 'dynamic-type-extra-large');
      root.style.setProperty('--apple-font-scale', String(40 / 17));
      root.style.setProperty('font-size', '37.64706px', 'important');
    });
  }
  await assertRootTextSize(page, testInfo, 'opening');
});

function requestedTextSize(testInfo) {
  return Number(process.env.PW_DYNAMIC_TYPE_SIZE ?? testInfo.project.metadata?.dynamicTypePreview ?? 0);
}

async function assertRootTextSize(page, testInfo, label) {
  const requested = requestedTextSize(testInfo);
  if (!requested) return;
  const root = await page.locator('html').evaluate(node => ({
    fontSize: getComputedStyle(node).fontSize,
    classes: [...node.classList],
    appleFontScale: getComputedStyle(node).getPropertyValue('--apple-font-scale').trim()
  }));
  expect(Number.parseFloat(root.fontSize), `${label}: the requested root text size must survive navigation and rotation`)
    .toBeCloseTo(requested, 2);
  expect(root.classes).toContain(requested > 32 ? 'dynamic-type-extra-large' : 'dynamic-type-preview');
  if (requested > 32) {
    expect(root.classes).toEqual(expect.arrayContaining(['dynamic-type-active', 'dynamic-type-apple']));
  }
  const path = testInfo.outputPath(`${label}-dynamic-type-root.json`);
  await writeFile(path, JSON.stringify({ requested, ...root }));
  await testInfo.attach(`${label}-dynamic-type-root`, { path, contentType: 'application/json' });
}

async function recordGeometry(page, target, label, testInfo) {
  await page.evaluate(() => document.fonts.ready);
  await expect(target).toBeVisible();
  await page.waitForTimeout(100);
  await assertRootTextSize(page, testInfo, label);
  const geometry = await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const body = element.closest('.expense-flow-body');
    const clip = body?.getBoundingClientRect();
    const nav = [...document.querySelectorAll('.product-app-nav')].find(node => node.getBoundingClientRect().height > 0);
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, height: rect.height,
      viewportHeight: innerHeight, clipTop: clip?.top ?? 0,
      clipBottom: clip?.bottom ?? nav?.getBoundingClientRect().top ?? innerHeight,
      receivesTap: element === hit || element.contains(hit),
      headerGeometry: [...document.querySelectorAll('.product-app-identity, .event-overview-header, .event-overview-header .brand, .event-overview-header h1, .event-header-meta, .event-header-actions, .event-header-utility-button, .event-workspace-nav')].map(node => {
        const bounds = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { classes: node.className, top: bounds.top, bottom: bounds.bottom, height: bounds.height,
          fontSize: style.fontSize, lineHeight: style.lineHeight, gap: style.gap, padding: style.padding,
          margin: style.margin, minHeight: style.minHeight, direction: style.flexDirection };
      }) };
  });
  const geometryPath = testInfo.outputPath(`${label}-geometry.json`);
  await writeFile(geometryPath, JSON.stringify(geometry));
  await testInfo.attach(label, { contentType: 'application/json', path: geometryPath });
  await page.screenshot({ path: testInfo.outputPath(`${label}.png`) });
  return geometry;
}

for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`landscape home keeps friends available in primary navigation on opening ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const friends = page.locator('.product-app-nav [data-nav-destination="friends"]');
    const geometry = await recordGeometry(page, friends, `home-${viewport.width}`, testInfo);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom, 'the friends navigation target stays inside the viewport').toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
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
    const header = page.locator('.event-overview-header');
    await expect(header.locator('h1')).toHaveText(state.events[0].name);
    const headerBounds = await header.evaluate(node => ({
      top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom,
      clientWidth: node.clientWidth, scrollWidth: node.scrollWidth
    }));
    expect(headerBounds.scrollWidth).toBeLessThanOrEqual(headerBounds.clientWidth + 1);
    const actions = header.locator('.event-header-utility-button');
    await expect(actions).toHaveCount(3);
    for (const [index, action] of (await actions.all()).entries()) {
      await action.evaluate(node => {
        const header = node.closest('.event-overview-header');
        const bounds = header.getBoundingClientRect(), target = node.getBoundingClientRect();
        if (target.bottom > bounds.bottom - 5) header.scrollBy(0, target.bottom - bounds.bottom + 5);
        else if (target.top < bounds.top + 5) header.scrollBy(0, target.top - bounds.top - 5);
      });
      const geometry = await recordGeometry(page, action, `event-utility-${viewport.width}-${index}`, testInfo);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.top).toBeGreaterThanOrEqual(headerBounds.top - 1);
      expect(geometry.bottom).toBeLessThanOrEqual(headerBounds.bottom + 1);
      expect(geometry.receivesTap).toBe(true);
      const labelFits = await action.evaluate(node => {
        const bounds = node.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(node.querySelector('.event-header-action-label'));
        return [...range.getClientRects()].filter(rect => rect.width && rect.height).every(rect =>
          rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
          rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1);
      });
      expect(labelFits, 'scrolling the full header must expose each complete utility label').toBe(true);
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
    const heading = page.locator('.event-notes-screen > .top h1');
    await expect(heading).toHaveText(state.events[0].name);
    for (const selector of ['.product-brand-copy strong', '.event-notes-screen > .top h1']) {
      const linesFit = await page.locator(selector).evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].filter(rect => rect.width && rect.height)
          .every(rect => rect.left >= -1 && rect.right <= innerWidth + 1);
      });
      expect(linesFit, `${selector} must keep every rendered word inside the viewport`).toBe(true);
    }
    const order = await page.locator('.event-notes-screen').evaluate(screen => {
      const children = [...screen.children];
      return {
        action: children.indexOf(screen.querySelector(':scope > [data-action="new-event-note"]')),
        tabs: children.indexOf(screen.querySelector(':scope > .event-workspace-nav')),
        header: children.indexOf(screen.querySelector(':scope > .event-overview-header')),
        utilitiesInHeader: Boolean(screen.querySelector(':scope > .event-overview-header .event-header-actions')),
        detachedUtilities: Boolean(screen.querySelector(':scope > .event-header-actions'))
      };
    });
    expect(order.action).toBeGreaterThanOrEqual(0);
    expect(order.action, 'the notes action must precede tabs in visual and keyboard order').toBeLessThan(order.tabs);
    expect(order.header, 'the shared reference header precedes the notes action').toBeLessThan(order.action);
    expect(order.utilitiesInHeader, 'all event utilities must remain inside the shared header').toBe(true);
    expect(order.detachedUtilities, 'no detached utility bar is permitted below tabs').toBe(false);
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

async function requireOpaqueEditorCoversBackground(page, testInfo, label) {
  await expect(page.locator('.event-note-modal')).toBeVisible();
  if (process.env.PW_NOTES_LAYER_OLD === '1' && await page.evaluate(() => innerWidth <= 480 && matchMedia('(orientation: portrait)').matches)) {
    await expect(page.locator('.event-notes-entry-action')).toHaveCSS('z-index', '110');
    await expect(page.locator('.event-notes-entry-action')).toHaveCSS('position', 'fixed');
  }
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.event-note-modal').focus();
  const panelIdentity = () => page.locator('.event-note-modal').evaluate(node => {
    const registry = window.__qaNotePaintNodes ||= { ids: new WeakMap(), next: 0 };
    if (!registry.ids.has(node)) registry.ids.set(node, ++registry.next);
    return registry.ids.get(node);
  });
  const settleEditorPaint = async () => {
    let stableFrames = 0, previousPanel;
    await expect.poll(async () => {
      const currentPanel = await panelIdentity();
      const settled = await page.locator('.event-note-modal').evaluate(node =>
        getComputedStyle(node).transform === 'none' && getComputedStyle(node.closest('.event-modal-backdrop')).opacity === '1' &&
        !node.closest('.event-modal-backdrop').getAnimations({ subtree: true }).some(animation =>
          animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity));
      stableFrames = settled && currentPanel === previousPanel ? stableFrames + 1 : 0;
      previousPanel = currentPanel;
      return stableFrames;
    }, { intervals: [100] }).toBeGreaterThanOrEqual(3);
  };
  await settleEditorPaint();
  // Disabling animations for a screenshot cancels and then restarts the modal
  // entrance animation. Compare completed frames without changing its state.
  const screenshotOptions = { animations: 'allow', caret: 'initial' };
  const sampleLayout = () => page.evaluate(() => {
    const modal = document.querySelector('.event-note-modal'), styles = getComputedStyle(modal);
    const backdrop = modal.closest('.event-modal-backdrop'), backdropStyle = getComputedStyle(backdrop);
    const action = document.querySelector('.event-notes-entry-action'), actionStyle = getComputedStyle(action), actionRect = action.getBoundingClientRect();
    const rect = modal.getBoundingClientRect();
    return { viewport: [innerWidth, innerHeight], rootFont: getComputedStyle(document.documentElement).fontSize,
      rootClasses: document.documentElement.className, bodyClasses: document.body.className,
      modal: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, padding: styles.padding,
        margin: styles.margin, transform: styles.transform, position: styles.position, zIndex: styles.zIndex },
      panelIdentity: window.__qaNotePaintNodes.ids.get(modal),
      backdrop: { zIndex: backdropStyle.zIndex, opacity: backdropStyle.opacity, transform: backdropStyle.transform },
      action: { position: actionStyle.position, zIndex: actionStyle.zIndex, transform: actionStyle.transform,
        rect: { x: actionRect.x, y: actionRect.y, width: actionRect.width, height: actionRect.height } },
      rootScroll: [scrollX, scrollY], navBlock: getComputedStyle(document.documentElement).getPropertyValue('--dynamic-type-bottom-nav-block') };
  });
  const layout = [];
  let actual;
  await expect.poll(async () => {
    await settleEditorPaint();
    const before = await sampleLayout(), first = await page.screenshot(screenshotOptions);
    const middle = await sampleLayout(), second = await page.screenshot(screenshotOptions), after = await sampleLayout();
    layout.push({ phase: 'A-A-before', ...before }, { phase: 'A-A-middle', ...middle }, { phase: 'A-A-after', ...after });
    const unchanged = Number.isSafeInteger(before.panelIdentity) && [before, middle, after].every(frame => frame.modal.transform === 'none' && frame.backdrop.opacity === '1' && frame.panelIdentity === before.panelIdentity);
    if (unchanged && first.equals(second)) { actual = second; return true; }
    return false;
  }, { intervals: [100] }).toBe(true);
  const actualFrame = await sampleLayout();
  expect(actualFrame.backdrop.zIndex).toBe('80');
  if (process.env.PW_NOTES_LAYER_OLD === '1' && actualFrame.viewport[0] <= 480) {
    expect(actualFrame.action.zIndex).toBe('110'); expect(actualFrame.action.position).toBe('fixed');
  }
  layout.push({ phase: 'before-actual', ...actualFrame });
  layout.push({ phase: 'after-actual', ...(await sampleLayout()) });
  const area = actualFrame.action.rect;
  const clip = { x: Math.max(0, area.x), y: Math.max(0, area.y),
    width: Math.min(actualFrame.viewport[0], area.x + area.width) - Math.max(0, area.x),
    height: Math.min(actualFrame.viewport[1], area.y + area.height) - Math.max(0, area.y) };
  const actionActual = clip.width > 0 && clip.height > 0 ? await page.screenshot({ ...screenshotOptions, clip }) : null;
  const backgroundCount = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#app button')].filter(node =>
      !node.closest('.event-modal-backdrop, .expense-modal-backdrop') &&
      node.getBoundingClientRect().width && node.getBoundingClientRect().height);
    return nodes.length;
  });
  // A persistent paint-only reference also applies to replacement background
  // nodes. It never affects editor controls, layout or typography readbacks.
  const paintReference = await page.addStyleTag({ content: '#app button:not(.event-modal-backdrop button, .expense-modal-backdrop button) { filter: opacity(0) !important; }' });
  let covered, actionCovered;
  try {
    await expect.poll(async () => {
      await settleEditorPaint();
      const before = await sampleLayout(), first = await page.screenshot(screenshotOptions);
      const middle = await sampleLayout(), second = await page.screenshot(screenshotOptions), after = await sampleLayout();
      layout.push({ phase: 'covered-A-A-before', ...before }, { phase: 'covered-A-A-middle', ...middle }, { phase: 'covered-A-A-after', ...after });
      const unchanged = Number.isSafeInteger(before.panelIdentity) && [before, middle, after].every(frame => frame.modal.transform === 'none' && frame.backdrop.opacity === '1' && frame.panelIdentity === before.panelIdentity);
      if (unchanged && first.equals(second)) { covered = second; return true; }
      return false;
    }, { intervals: [100] }).toBe(true);
    actionCovered = actionActual ? await page.screenshot({ ...screenshotOptions, clip }) : null;
    layout.push({ phase: 'after-covered', ...(await sampleLayout()) });
  }
  finally {
    await paintReference.evaluate(node => node.remove());
  }
  expect(backgroundCount).toBeGreaterThan(0);
  await writeFile(testInfo.outputPath(`${label}-paint-layout.json`), JSON.stringify(layout));
  const actualPath = testInfo.outputPath(`${label}-actual-editor.png`);
  const coveredPath = testInfo.outputPath(`${label}-covered-background-reference.png`);
  await writeFile(actualPath, actual); await writeFile(coveredPath, covered);
  await testInfo.attach(`${label}-actual-editor`, { path: actualPath, contentType: 'image/png' });
  await testInfo.attach(`${label}-covered-background-reference`, { path: coveredPath, contentType: 'image/png' });
  if (actionActual) {
    await testInfo.attach(`${label}-action-actual`, { body: actionActual, contentType: 'image/png' });
    await testInfo.attach(`${label}-action-covered`, { body: actionCovered, contentType: 'image/png' });
    if (process.env.PW_NOTES_LAYER_OLD === '1' && actualFrame.viewport[0] <= 480) {
      expect(actionActual.equals(actionCovered), 'verified OLD fixed110 must visibly differ inside the actual action rectangle').toBe(false);
    }
  }
  expect(actual.equals(covered), 'background actions must not paint above the opaque note editor, even when inert').toBe(true);
}

for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test(`notes editor covers background actions and preserves the draft across rotation ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    await page.locator('[data-action="open-event-notes"]').click();
    if (process.env.PW_NOTES_LAYER_OLD === '1') {
      // Controlled reproduction of the exact historical 0d94 paint regression.
      // No input, bridge, readiness or typography assertion is changed.
      await page.addStyleTag({ content: `@media (max-width: 480px) and (orientation: portrait) {
        html:is(.dynamic-type-large, .dynamic-type-extra-large, .dynamic-type-preview).design-coherence-v1.ledger-workspace-v1 body #app .screen.event-notes-screen > .event-notes-entry-action {
          position: fixed !important; left: 50% !important; right: auto !important;
          bottom: calc(var(--dynamic-type-bottom-nav-block, 82px) + env(safe-area-inset-bottom) + max(14px, env(safe-area-inset-bottom)) + 12px) !important;
          width: calc(100% - 28px) !important; max-width: 420px !important; margin: 0 !important;
          transform: translateX(-50%) !important; z-index: 110 !important;
        }
      }` });
    }
    await page.locator('[data-action="new-event-note"]').click();
    await requireOpaqueEditorCoversBackground(page, testInfo, `opening-${viewport.width}`);
    const title = page.locator('[data-action="event-note-title"]');
    const body = page.locator('[data-action="event-note-body"]');
    await title.fill('בדיקת שכבות 194');
    await body.fill('טיוטת פתק לאייפד ולאנדרואיד');
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await assertRootTextSize(page, testInfo, 'rotated-note-editor');
    await expect(title).toHaveValue('בדיקת שכבות 194');
    await expect(body).toHaveValue('טיוטת פתק לאייפד ולאנדרואיד');
    await requireOpaqueEditorCoversBackground(page, testInfo, `rotated-${viewport.width}`);
    await page.locator('.event-note-modal [data-action="close-event-dialog"]').first().click();
    await expect(page.locator('.event-note-modal')).toHaveCount(0);
    await expect(page.locator('.event-note-open')).toHaveCount(0);
    await page.locator('[data-action="new-event-note"]').click();
    // Explicit Close is the product's discard action; rotation above retains
    // the active draft, while cancelling must leave a fresh new-note editor.
    await expect(title).toHaveValue('');
    await expect(body).toHaveValue('');
    await title.fill('בדיקת שכבות 194');
    await body.fill('טיוטת פתק לאייפד ולאנדרואיד');
    await body.click();
    await body.press('ControlOrMeta+End');
    await page.keyboard.insertText(' — המשך הקלדה');
    await expect(title).toHaveValue('בדיקת שכבות 194');
    await expect(body).toHaveValue('טיוטת פתק לאייפד ולאנדרואיד — המשך הקלדה');
    await page.locator('[data-action="save-event-note"]').click();
    await expect(page.locator('.event-note-modal')).toHaveCount(0);
    await expect(page.locator('.event-note-open')).toHaveCount(1);
    // This browser fixture uses the real local provider, so inspect its final
    // persisted note. Shared server acknowledgements have separate Native and
    // two-client gates; the unrelated global QA seed is not a cloud receipt.
    await expect.poll(() => page.evaluate(eventId =>
      JSON.parse(localStorage.getItem('settle-friends-state')).events.find(event => event.id === eventId)?.notes?.map(note => ({ title: note.title, body: note.body })), eventId)
    ).toEqual([{ title: 'בדיקת שכבות 194', body: 'טיוטת פתק לאייפד ולאנדרואיד — המשך הקלדה' }]);
  });
}
