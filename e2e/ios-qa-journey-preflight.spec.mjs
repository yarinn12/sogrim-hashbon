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

test('the accessibility XL amount and next controls stay hittable above the iOS keyboard', async ({ page }, testInfo) => {
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
  const next = page.locator('[data-action="expense-step-next"]');
  if (testInfo.project.use.hasTouch) await next.tap();
  else await next.click();
  await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step', 'name');
});
