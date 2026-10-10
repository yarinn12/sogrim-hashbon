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
