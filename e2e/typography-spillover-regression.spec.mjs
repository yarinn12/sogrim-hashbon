import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const OWNER = 'person-spillover-owner';
const PEER = 'person-spillover-peer';
const EVENT = 'event-spillover-typography';
const state = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: 'ירין יצחק', kind: 'user', avatarPreset: 'avatar-1' },
    { id: PEER, displayName: 'מאור סיבוני מהקבוצה המשותפת', kind: 'guest', avatarPreset: 'avatar-2' }
  ],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: EVENT,
    name: 'אירוע משפחתי ארוך במיוחד בירושלים ובתל אביב עם כמה הוצאות ופתקים משותפים',
    eventType: 'trip', currency: 'ILS', participantIds: [OWNER, PEER], adminIds: [OWNER],
    createdByParticipantId: OWNER, createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z', statusUpdatedAt: '2026-10-01T08:00:00.000Z',
    roundSettlementTransfers: true, locked: false, transfers: [], activityLog: [],
    expenses: [{ id: 'expense-spillover-train',
      name: 'כרטיסי רכבת ומלון עבור כל המשתתפים בחופשה המשפחתית', total: 12600,
      payers: [{ participantId: OWNER, amount: 12600 }],
      sharedByParticipantIds: [OWNER, PEER], createdByParticipantId: OWNER,
      occurredOn: '2026-10-01', updatedAt: '2026-10-01T08:00:00.000Z' }],
    notes: [{ id: 'note-spillover-details',
      title: 'פרטי טיסה ארוכים ושמות המשתתפים בחופשה המשפחתית',
      body: 'נפגשים בטרמינל שלוש בשעה שמונה וחצי ליד הכניסה הראשית.',
      pinned: true, createdByParticipantId: OWNER, updatedByParticipantId: OWNER,
      createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }] }]
};

const targets = {
  home: [
    '.product-brand-copy strong', '.product-home-screen .top .brand h1',
    '.product-home-screen .top .brand .muted', '.home-create-event-action',
    '.home-quick-action', '[data-action="open-event"] .event-row-main'
  ],
  event: [
    '.product-brand-copy strong', '.event-overview-header h1',
    '.event-header-action-label', '.expense-row strong',
    '.event-workspace-tab strong', '[data-action="show-expense-form"]'
  ],
  notes: [
    '.product-brand-copy strong', '[data-screen-kind="event-notes"] h1',
    '.event-notes-intro h2', '.event-notes-intro .muted',
    '.event-note-title-line strong', '.event-note-preview',
    '.event-workspace-tab strong', '[data-action="new-event-note"]'
  ],
  profile: [
    '.product-brand-copy strong', '[data-screen-kind="profile"] h1',
    '.profile-identity-copy strong', '.profile-identity-entry',
    '.profile-friends-entry'
  ]
};

async function measure(page, mode, screen) {
  const selectors = targets[screen];
  const value = await page.evaluate(selectors => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const records = Object.fromEntries(selectors.map(selector => {
      const element = [...document.querySelectorAll(selector)].find(visible);
      if (!element) return [selector, null];
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [selector, { text: element.textContent.trim().replace(/\s+/gu, ' ').slice(0, 120),
        fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight,
        width: box.width, height: box.height,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }];
    }));
    return { viewport: { width: innerWidth, height: innerHeight },
      rootClassName: document.documentElement.className,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth, records };
  }, selectors);
  console.log(JSON.stringify({ kind: 'typography-spillover', mode, screen, ...value }));
  return value;
}

test('rendered home, expenses, notes and profile text grow without clipping at 32 and AX-equivalent 37.647', async ({ page, request }, testInfo) => {
  await request.post('/api/reset');
  await request.put('/api/state', { data: state });
  await page.addInitScript(({ state, owner }) => {
    if (!sessionStorage.getItem('spillover-seeded')) {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('settle-friends-state', JSON.stringify(state));
      localStorage.setItem('settle-friends-current-participant', owner);
      localStorage.setItem('settle-friends-local-profile', JSON.stringify({
        participantId: owner, displayName: 'ירין יצחק', avatarPreset: 'avatar-1'
      }));
      sessionStorage.setItem('spillover-seeded', '1');
    }
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  }, { state, owner: OWNER });

  const samples = {};
  for (const mode of ['normal', '32', 'AX-active']) {
    samples[mode] = {};
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(mode === '32' ? '/?dynamic-type-preview=32' : '/');
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    if (mode === 'AX-active') {
      await page.evaluate(() => {
        const root = document.documentElement;
        root.classList.add('dynamic-type-active', 'dynamic-type-apple', 'dynamic-type-extra-large');
        root.style.setProperty('--apple-font-scale', String(40 / 17));
        root.style.setProperty('font-size', '37.64706px', 'important');
      });
    }
    samples[mode].home = await measure(page, mode, 'home');
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
    await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT}"]`)).toBeVisible();
    samples[mode].event = await measure(page, mode, 'event');
    if (mode === 'AX-active') {
      await testInfo.attach('ax-equivalent-event', {
        body: await page.screenshot(), contentType: 'image/png'
      });
    }
    await page.locator('[data-action="open-event-notes"]:visible').first().click();
    await expect(page.locator(`[data-screen-kind="event-notes"][data-event-id="${EVENT}"]`)).toBeVisible();
    samples[mode].notes = await measure(page, mode, 'notes');
    if (mode === 'AX-active') {
      await testInfo.attach('ax-equivalent-notes', {
        body: await page.screenshot(), contentType: 'image/png'
      });
    }
    await page.locator('[data-action="edit-profile"]:visible').first().click();
    await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
    samples[mode].profile = await measure(page, mode, 'profile');
    if (mode === 'AX-active') {
      await testInfo.attach('ax-equivalent-profile', {
        body: await page.screenshot(), contentType: 'image/png'
      });
    }
  }
  await testInfo.attach('typography-spillover-measurements', {
    body: JSON.stringify(samples, null, 2), contentType: 'application/json'
  });

  const scaleTargets = {
    home: ['.product-brand-copy strong', '.product-home-screen .top .brand h1',
      '.product-home-screen .top .brand .muted', '.home-create-event-action'],
    event: ['.product-brand-copy strong', '.event-overview-header h1',
      '.event-header-action-label', '.expense-row strong',
      '.event-workspace-tab strong', '[data-action="show-expense-form"]'],
    notes: ['.product-brand-copy strong', '[data-screen-kind="event-notes"] h1',
      '.event-notes-intro h2', '.event-notes-intro .muted',
      '.event-note-title-line strong', '.event-note-preview',
      '[data-action="new-event-note"]'],
    profile: ['.product-brand-copy strong', '[data-screen-kind="profile"] h1',
      '.profile-identity-copy strong', '.profile-friends-entry']
  };
  for (const [screen, selectors] of Object.entries(scaleTargets)) {
    for (const mode of ['normal', '32', 'AX-active']) {
      const snapshot = samples[mode][screen];
      expect.soft(snapshot.documentWidth, `${mode}/${screen}: document width`)
        .toBeLessThanOrEqual(snapshot.viewport.width + 1);
      expect.soft(snapshot.bodyWidth, `${mode}/${screen}: body width`)
        .toBeLessThanOrEqual(snapshot.viewport.width + 1);
      expect.soft(parseFloat(snapshot.rootFontSize), `${mode}/${screen}: requested root size`)
        .toBeCloseTo(mode === 'normal' ? 16 : mode === '32' ? 32 : 37.64706, 3);
      if (mode === 'AX-active') {
        expect.soft(snapshot.rootClassName, `${mode}/${screen}: active iOS category`)
          .toContain('dynamic-type-extra-large');
      }
    }
    for (const selector of selectors) {
      const baseline = samples.normal[screen].records[selector];
      const enlarged = samples['32'][screen].records[selector];
      const ax = samples['AX-active'][screen].records[selector];
      expect.soft(baseline, `${screen}/${selector}: baseline target exists`).not.toBeNull();
      expect.soft(enlarged, `${screen}/${selector}: 32px target exists`).not.toBeNull();
      expect.soft(ax, `${screen}/${selector}: AX target exists`).not.toBeNull();
      if (!baseline || !enlarged || !ax) continue;
      expect.soft(enlarged.fontSize, `${screen}/${selector}: 32px text must grow`)
        .toBeGreaterThanOrEqual(baseline.fontSize * 1.5);
      expect.soft(ax.fontSize, `${screen}/${selector}: AX text must grow beyond 32px`)
        .toBeGreaterThanOrEqual(enlarged.fontSize * 1.1);
    }
  }
  for (const screen of ['event', 'notes']) {
    for (const mode of ['32', 'AX-active']) {
      const label = samples[mode][screen].records['.event-workspace-tab strong'];
      expect.soft(label.scrollWidth, `${mode}/${screen}: workspace tab label must fit`)
        .toBeLessThanOrEqual(label.clientWidth + 1);
    }
  }
});
