import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/qa/ios-parity/input-trace.js', import.meta.url));

async function install(page) {
  await page.setContent(`
    <button data-action="expense-step-next">Private participant name</button>
    <input data-action="expense-total" value="private financial value">
  `);
  await page.evaluate(() => {
    window.__inputMessages = [];
    window.webkit = { messageHandlers: { iosParity: { postMessage: row => window.__inputMessages.push(row) } } };
    window.__buttonClicks = 0;
    document.querySelector('button').addEventListener('click', () => { window.__buttonClicks += 1; });
  });
  await page.addScriptTag({ path: script });
  await page.evaluate(() => {
    window.__iosParityInputTrace.setPhase('keyboard-amount');
    window.__iosParityInputTrace.arm();
  });
}

test('real browser tap reaches the button and is logged without private content', async ({ page }) => {
  await install(page);
  await page.locator('button').click();
  const result = await page.evaluate(() => ({
    snapshot: window.__iosParityInputTrace.snapshot(),
    messages: window.__inputMessages,
    buttonClicks: window.__buttonClicks
  }));
  expect(result.buttonClicks).toBe(1);
  const rows = result.messages.map(message => message.inputEvent);
  expect(rows.map(row => row.type)).toContain('pointerdown');
  expect(rows.map(row => row.type)).toContain('pointerup');
  expect(rows.map(row => row.type)).toContain('click');
  expect(rows.filter(row => row.type === 'click')).toEqual([
    expect.objectContaining({ trusted: true, phase: 'keyboard-amount',
      target: { tag: 'button', action: 'expense-step-next' },
      hit: { tag: 'button', action: 'expense-step-next' },
      x: expect.any(Number), y: expect.any(Number), epochMs: expect.any(Number) })
  ]);
  expect(result.snapshot.count).toBe(rows.length);
  expect(JSON.stringify(result)).not.toMatch(/Private participant name|private financial value/);
});

test('synthetic clicks stay untrusted and the diagnostic buffer stays bounded', async ({ page }) => {
  await install(page);
  await page.evaluate(() => {
    const privateElement = document.createElement('private-person-tag');
    privateElement.id = 'private-person-id';
    privateElement.dataset.action = 'private-action-secret';
    document.body.append(privateElement);
    privateElement.click();
    for (let index = 0; index < 59; index += 1) document.querySelector('button').click();
  });
  const result = await page.evaluate(() => ({
    snapshot: window.__iosParityInputTrace.snapshot(),
    messages: window.__inputMessages,
    buttonClicks: window.__buttonClicks
  }));
  expect(result.buttonClicks).toBe(59);
  expect(result.snapshot).toMatchObject({ count: 48, dropped: 12, bridgeErrors: 0 });
  expect(result.snapshot.recent).toHaveLength(12);
  expect(result.messages).toHaveLength(48);
  expect(result.messages.every(message => message.kind === 'input-event'
    && message.inputEvent.trusted === false)).toBe(true);
  expect(result.messages[0].inputEvent.target).toEqual({ tag: 'other', action: 'other' });
  expect(JSON.stringify(result)).not.toMatch(/private-person|private-action-secret/);
});

test('touchscreen input records trusted touch coordinates without changing the click', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 393, height: 852 } });
  try {
    const page = await context.newPage();
    await install(page);
    const box = await page.locator('button').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const result = await page.evaluate(() => ({
      messages: window.__inputMessages,
      buttonClicks: window.__buttonClicks
    }));
    expect(result.buttonClicks).toBe(1);
    const rows = result.messages.map(message => message.inputEvent);
    for (const type of ['touchstart', 'touchend', 'click']) {
      expect(rows).toContainEqual(expect.objectContaining({ type, trusted: true,
        x: expect.any(Number), y: expect.any(Number),
        target: { tag: 'button', action: 'expense-step-next' } }));
    }
  } finally {
    await context.close();
  }
});
