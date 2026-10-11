import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Run the QA fixture and navigation script themselves. Only the Capacitor
// identity and screenshot acknowledgement are simulated in this browser test.
const syntheticService = await readFile(new URL('../scripts/qa/ios-parity/synthetic-service.js', import.meta.url), 'utf8');
const journey = await readFile(new URL('../scripts/qa/ios-parity/journey.js', import.meta.url), 'utf8');
const phases = ['home', 'expenses', 'summary', 'transfers', 'notes', 'note-opened', 'profile', 'keyboard-ready'];
const fields = {
  home: ['brand', 'description'],
  expenses: ['heading', 'tab', 'tab2', 'tab3'],
  summary: ['description', 'status', 'helper'],
  transfers: ['longName', 'amount', 'badge', 'debt', 'equation'],
  notes: ['title', 'preview'],
  'note-opened': ['body'],
  profile: ['name'],
  'keyboard-ready': ['amount']
};

async function installNativeReadinessAdapter(page, mode = 'held-info') {
  await page.evaluate(mode => {
    const original = globalThis.Capacitor || {};
    globalThis.__iosQaBrowserCaptures = [];
    globalThis.__iosQaAdapterStatuses = [];
    let releaseInfo;
    const info = new Promise((resolve, reject) => {
      releaseInfo = () => mode === 'rejected-info'
        ? reject(new Error('Synthetic native info failure before home'))
        : resolve({ id: 'com.sogrimhashbon.app', name: 'Readiness Adapter', version: '0', build: '0' });
    });
    globalThis.__iosQaReleaseInfo = releaseInfo;
    globalThis.Capacitor = {
      ...original, isNativePlatform: () => true, getPlatform: () => 'ios',
      Plugins: { ...original.Plugins, App: { ...original.Plugins?.App, getInfo: () => info } }
    };
    globalThis.webkit ??= {};
    globalThis.webkit.messageHandlers ??= {};
    globalThis.webkit.messageHandlers.iosParity = { postMessage(record) {
      globalThis.__iosQaBrowserCaptures.push(record);
      if (record.phase !== 'home') queueMicrotask(() => globalThis.__iosParityCaptureAck?.(record.index));
      else globalThis.__iosQaReleaseHomeCapture = () => globalThis.__iosParityCaptureAck?.(record.index);
    } };
    // This is the read-only status boundary, not UIKit or Native acceptance.
    // The legacy bridge exposed every parsed state, including "starting".
    globalThis.__iosQaReadStatus = () => {
      const live = globalThis.__iosParityLive?.();
      const exposed = live && (live.nativeStatusReady === undefined
        || live.nativeStatusReady === true || live.phase === 'error');
      const result = exposed ? live : null;
      globalThis.__iosQaAdapterStatuses.push({ phase: live?.phase, exposed: Boolean(exposed) });
      return result;
    };
  }, mode);
}

test('native status stays unavailable through bootstrap and an unacknowledged first capture', async ({ page }, testInfo) => {
  await page.addInitScript({ content: syntheticService });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible({ timeout: 15_000 });
  await installNativeReadinessAdapter(page);
  await page.evaluate(journey);
  const starting = await page.evaluate(() => ({
    phase: globalThis.__iosParityLive().phase,
    status: globalThis.__iosQaReadStatus(),
    captures: globalThis.__iosQaBrowserCaptures.length
  }));
  expect(starting).toEqual({ phase: 'starting', status: null, captures: 0 });
  await page.evaluate(() => globalThis.__iosQaReleaseInfo());
  await page.waitForFunction(() => globalThis.__iosQaBrowserCaptures[0]?.phase === 'home', null, { timeout: 10_000 });
  expect(await page.evaluate(() => globalThis.__iosQaReadStatus())).toBeNull();
  await page.evaluate(() => globalThis.__iosQaReleaseHomeCapture());
  await page.waitForFunction(() => globalThis.__iosQaReadStatus() !== null, null, { timeout: 10_000 });
  await page.waitForFunction(() => ['keyboard-ready', 'error'].includes(globalThis.__iosParityLive().phase),
    null, { timeout: 35_000 });
  const final = await page.evaluate(() => ({
    live: globalThis.__iosQaReadStatus(),
    captures: globalThis.__iosQaBrowserCaptures,
    statuses: globalThis.__iosQaAdapterStatuses
  }));
  await testInfo.attach('native-readiness-adapter', {
    body: JSON.stringify(final, null, 2), contentType: 'application/json'
  });
  expect(final.captures.map(record => record.phase), JSON.stringify(final.live?.errors)).toEqual(phases);
  expect(final.live.errors).toEqual([]);
  expect(final.live.phase).toBe('keyboard-ready');
  expect(final.live.nativeStatusReady).toBe(true);
  expect(final.captures.every(record => record.errors.length === 0)).toBe(true);
  expect(final.statuses.filter(record => record.phase === 'starting').every(record => !record.exposed)).toBe(true);
});

test('a native bootstrap error is exposed before the first capture rather than hidden behind readiness', async ({ page }) => {
  await page.addInitScript({ content: syntheticService });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible({ timeout: 15_000 });
  await installNativeReadinessAdapter(page, 'rejected-info');
  await page.evaluate(journey);
  await page.evaluate(() => globalThis.__iosQaReleaseInfo());
  await page.waitForFunction(() => globalThis.__iosParityLive().phase === 'error', null, { timeout: 5_000 });
  const live = await page.evaluate(() => globalThis.__iosQaReadStatus());
  expect(live).not.toBeNull();
  expect(live.phase).toBe('error');
  expect(live.errors.join(' ')).toContain('Synthetic native info failure before home');
  expect(await page.evaluate(() => globalThis.__iosQaBrowserCaptures.map(record => record.phase))).toEqual(['error']);
});


test('the isolated iOS QA journey reaches keyboard-ready through the real DOM controls', async ({ page }, testInfo) => {
  await page.addInitScript({ content: syntheticService });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    const browserCapacitor = globalThis.Capacitor || {};
    globalThis.Capacitor = {
      ...browserCapacitor,
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        ...browserCapacitor.Plugins,
        App: { ...browserCapacitor.Plugins?.App,
          getInfo: async () => ({ id: 'com.sogrimhashbon.app', name: 'Synthetic Browser Preflight', version: '0', build: '0' }) }
      }
    };
    globalThis.__iosQaBrowserCaptures = [];
    globalThis.webkit ??= {};
    globalThis.webkit.messageHandlers ??= {};
    globalThis.webkit.messageHandlers.iosParity = { postMessage(record) {
      globalThis.__iosQaBrowserCaptures.push(record);
      queueMicrotask(() => globalThis.__iosParityCaptureAck?.(record.index));
    } };
  });
  await page.evaluate(journey);

  await page.waitForFunction(() => ['keyboard-ready', 'error'].includes(
    globalThis.__iosQaBrowserCaptures?.at(-1)?.phase
  ), null, { timeout: 45_000 });
  const records = await page.evaluate(() => globalThis.__iosQaBrowserCaptures);
  await testInfo.attach('synthetic-browser-journey', {
    body: JSON.stringify(records, null, 2), contentType: 'application/json'
  });
  expect(records.map(record => record.phase), JSON.stringify(records.at(-1)?.errors || [])).toEqual(phases);

  for (const record of records) {
    expect(record.errors).toEqual([]);
    expect(Object.keys(record.metrics)).toEqual(fields[record.phase]);
    for (const metric of Object.values(record.metrics)) {
      expect(metric.width).toBeGreaterThan(0);
      expect(metric.fontSize).toBeGreaterThan(0);
      if (!metric.isTextControl) expect(metric.words.length).toBeGreaterThan(0);
    }
  }
  const note = records.find(record => record.phase === 'note-opened');
  const saved = note.saved.state.events[0].notes[0];
  expect(note.openedNote).toEqual({ title: saved.title, body: saved.body });
  expect(records.find(record => record.phase === 'transfers').metrics.debt.text).not.toBe('');
  expect(records.at(-1).metrics.amount.isTextControl).toBe(true);
  const fixtureHealth = await page.evaluate(() => ({
    blocked: JSON.parse(localStorage.getItem('qa-native-blocked-network') || '[]'),
    unhandled: JSON.parse(localStorage.getItem('qa-native-unhandled') || '[]')
  }));
  expect(fixtureHealth).toEqual({ blocked: [], unhandled: [] });
});

test('the accessibility XL expense fields stay hittable below the status bar and above the iOS keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript({ content: syntheticService });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.__setKeyboardViewport = height => {
      viewport.height = height;
      viewport.dispatchEvent(new Event('resize'));
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.add('native-app', 'dynamic-type-active', 'dynamic-type-apple', 'dynamic-type-extra-large');
    root.style.setProperty('--apple-font-scale', String(40 / 17));
    root.style.setProperty('font-size', '37.64706px', 'important');
    const browserCapacitor = globalThis.Capacitor || {};
    globalThis.Capacitor = {
      ...browserCapacitor, isNativePlatform: () => true, getPlatform: () => 'ios',
      Plugins: { ...browserCapacitor.Plugins, App: {
        ...browserCapacitor.Plugins?.App,
        getInfo: async () => ({ id: 'com.sogrimhashbon.app', name: 'Synthetic Browser Preflight', version: '0', build: '0' })
      } }
    };
    globalThis.__iosQaBrowserCaptures = [];
    globalThis.webkit ??= {};
    globalThis.webkit.messageHandlers ??= {};
    globalThis.webkit.messageHandlers.iosParity = { postMessage(record) {
      globalThis.__iosQaBrowserCaptures.push(record);
      queueMicrotask(() => globalThis.__iosParityCaptureAck?.(record.index));
    } };
  });
  await page.evaluate(journey);
  await page.waitForFunction(() => ['keyboard-ready', 'error'].includes(
    globalThis.__iosQaBrowserCaptures?.at(-1)?.phase
  ), null, { timeout: 45_000 });
  const phase = await page.evaluate(() => globalThis.__iosQaBrowserCaptures?.at(-1));
  expect(phase.phase, JSON.stringify(phase.errors || [])).toBe('keyboard-ready');
  const amount = page.locator('[data-action="expense-total"]');
  await expect(amount).toBeFocused();
  // Headless WebKit reports zero safe-area insets. The native iPhone in this
  // regression has a 59px top inset, which reduces the keyboard-open body.
  await page.locator('.expense-modal-step-header').evaluate(element => {
    const current = parseFloat(getComputedStyle(element).paddingTop);
    element.style.setProperty('padding-top', `${current + 59}px`, 'important');
  });
  await page.evaluate(() => window.__setKeyboardViewport(476));
  await expect(page.locator('html')).toHaveClass(/app-software-keyboard-open/);
  await amount.evaluate(element => element.scrollIntoView({ block: 'center' }));

  const controls = await page.evaluate(() => {
    const inspect = selector => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { top: rect.top, bottom: rect.bottom, hit: hit?.outerHTML?.slice(0, 180),
        hittable: Boolean(hit && (element === hit || element.contains(hit))) };
    };
    const details = selector => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { top: rect.top, bottom: rect.bottom, clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight, scrollTop: element.scrollTop,
        overflowY: style.overflowY, position: style.position };
    };
    return { amount: inspect('[data-action="expense-total"]'),
      next: inspect('[data-action="expense-step-next"]'),
      progress: inspect('.expense-flow-progress'),
      modal: details('.expense-step-modal'),
      header: details('.expense-modal-step-header'),
      fields: details('.expense-flow-fields'),
      body: details('.expense-flow-body'),
      footer: details('.expense-modal-actions'),
      visualHeight: visualViewport.height };
  });
  await testInfo.attach('accessibility-xl-keyboard-hits', {
    body: JSON.stringify(controls, null, 2), contentType: 'application/json'
  });
  expect(controls.progress.bottom, JSON.stringify(controls)).toBeLessThan(controls.amount.top);
  for (const control of [controls.amount, controls.next]) {
    expect(control.top, JSON.stringify(controls)).toBeGreaterThanOrEqual(0);
    expect(control.bottom, JSON.stringify(controls)).toBeLessThanOrEqual(controls.visualHeight);
    expect(control.hittable, JSON.stringify(controls)).toBe(true);
  }
  await amount.fill('120');
  await page.waitForFunction(() => ['keyboard-amount', 'error'].includes(
    globalThis.__iosQaBrowserCaptures?.at(-1)?.phase
  ), null, { timeout: 15_000 });
  const amountPhase = await page.evaluate(() => globalThis.__iosQaBrowserCaptures?.at(-1));
  expect(amountPhase.phase, JSON.stringify(amountPhase.errors || [])).toBe('keyboard-amount');
  const next = page.locator('[data-action="expense-step-next"]');
  if (testInfo.project.use.hasTouch) await next.tap();
  else await next.click();
  await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step', 'name');
  await page.locator('.expense-modal-step-header').evaluate(element => {
    const current = parseFloat(getComputedStyle(element).paddingTop);
    element.style.setProperty('padding-top', `${current + 59}px`, 'important');
  });
  const name = page.locator('[data-action="expense-name"]');
  await name.evaluate(element => element.scrollIntoView({ block: 'center' }));
  if (testInfo.project.use.hasTouch) await name.tap();
  else await name.click();
  await page.evaluate(() => window.__setKeyboardViewport(449));
  // UIKit can scroll the focused control again when it switches from the
  // decimal to text keyboard. Reproduce the native 126px displacement that
  // placed the field at -19px while its DOM center still accepted typing.
  await page.locator('.expense-step-modal').evaluate(element => { element.scrollTop += 126; });
  await expect(name).toBeFocused();
  await page.keyboard.type('QA iOS');
  await page.waitForFunction(() => ['keyboard-name', 'error'].includes(
    globalThis.__iosQaBrowserCaptures?.at(-1)?.phase
  ), null, { timeout: 15_000 });
  const namePhase = await page.evaluate(() => globalThis.__iosQaBrowserCaptures?.at(-1));
  expect(namePhase.phase, JSON.stringify(namePhase.errors || [])).toBe('keyboard-name');
  const readNameControls = () => page.evaluate(() => {
    const inspect = selector => {
      const element = document.querySelector(selector);
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return { top: bounds.top, bottom: bounds.bottom,
        hit: hit?.outerHTML?.slice(0, 180),
        hittable: Boolean(hit && (element === hit || element.contains(hit))) };
    };
    return { name: inspect('[data-action="expense-name"]'),
      next: inspect('[data-action="expense-step-next"]'),
      progress: inspect('.expense-flow-progress'),
      modalScrollTop: document.querySelector('.expense-step-modal').scrollTop,
      visualHeight: visualViewport.height };
  });
  const nameControls = await readNameControls();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const settledControls = await readNameControls();
  await testInfo.attach('accessibility-xl-name-keyboard-hits', {
    body: JSON.stringify({ nameControls, settledControls }, null, 2), contentType: 'application/json'
  });
  for (const sample of [nameControls, settledControls]) {
    expect(sample.name.top, JSON.stringify(sample)).toBeGreaterThanOrEqual(54);
    expect(sample.name.bottom, JSON.stringify(sample)).toBeLessThanOrEqual(sample.visualHeight);
    expect(sample.name.hittable, JSON.stringify(sample)).toBe(true);
    expect(sample.next.bottom, JSON.stringify(sample)).toBeLessThanOrEqual(sample.visualHeight);
    expect(sample.next.hittable, JSON.stringify(sample)).toBe(true);
  }
  expect(settledControls.modalScrollTop).toBeCloseTo(nameControls.modalScrollTop, 0);
});
