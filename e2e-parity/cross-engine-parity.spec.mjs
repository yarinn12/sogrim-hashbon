import { chromium, firefox, webkit, expect, test } from "@playwright/test";

const OWNER = "person-cross-engine-owner";
const FRIEND = "person-cross-engine-friend";
const THIRD = "person-cross-engine-third";
const EVENT = "event-cross-engine-parity";
const state = {
  currentParticipantId: OWNER,
  participants: [
    { id: OWNER, displayName: "בודק אחידות", kind: "user", avatarPreset: "avatar-1" },
    { id: FRIEND, displayName: "חבר מהטיול Lisbon 2026", kind: "guest", avatarPreset: "avatar-2" },
    { id: THIRD, displayName: "עוד חברה מהטיול", kind: "guest", avatarPreset: "avatar-3" }
  ],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: EVENT, name: "סופ״ש משפחתי Lisbon 2026 · בדיקת מסכים", eventType: "trip", currency: "ILS",
    participantIds: [OWNER, FRIEND, THIRD], adminIds: [OWNER], createdByParticipantId: OWNER,
    createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:01.000Z",
    roundSettlementTransfers: true, directSettlementTransfers: false, locked: false,
    expenses: [{
      id: "expense-cross-engine", name: "ארוחת ערב משותפת במסעדה", total: 12345,
      payers: [{ participantId: OWNER, amount: 12345 }], sharedByParticipantIds: [OWNER, FRIEND, THIRD],
      createdByParticipantId: OWNER, updatedAt: "2026-10-01T08:00:01.000Z"
    }], transfers: [], notes: [{
      id: "note-cross-engine", title: "פרטי נסיעה", body: "נפגשים בכניסה הראשית.", pinned: true,
      createdByParticipantId: OWNER, updatedByParticipantId: OWNER,
      createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z"
    }], activityLog: []
  }]
};

async function textLayout(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate(async element => {
    const style = getComputedStyle(element);
    await document.fonts.load(`${style.fontWeight} ${style.fontSize} Rubik`, element.textContent);
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const lines = new Map();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of node.textContent.matchAll(/\S+/gu)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
        if (!rects.length) continue;
        const top = Math.round(rects[0].top);
        const fragment = { text: word[0], rows: new Set(rects.map(rect => Math.round(rect.top))).size };
        lines.set(top, [...(lines.get(top) ?? []), fragment]);
      }
    }
    const bounds = element.getBoundingClientRect();
    return {
      text: element.textContent.trim().replace(/\s+/gu, " "),
      wordLines: [...lines.values()],
      family: style.fontFamily.split(",").map(name => name.trim().replace(/^(["'])(.*)\1$/, "$2")),
      size: parseFloat(style.fontSize), weight: style.fontWeight,
      lineHeight: style.lineHeight === "normal" ? "normal" : parseFloat(style.lineHeight),
      width: bounds.width, height: bounds.height,
      clippedHorizontally: element.scrollWidth > element.clientWidth + 1,
      color: style.color, direction: style.direction
    };
  });
}

async function capture(page, testInfo, name, targets) {
  const metrics = {};
  for (const [key, selector] of Object.entries(targets)) {
    metrics[key] = await textLayout(page.locator(selector).first());
    expect(metrics[key].clippedHorizontally, `${name}/${key}: full text width`).toBe(false);
  }
  const layout = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    rtl: getComputedStyle(document.body).direction
  }));
  expect(layout.overflow, `${name}: no page overflow`).toBe(false);
  expect(layout.rtl).toBe("rtl");
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  return { ...layout, metrics };
}

async function journey(engine, name, request, baseURL, scenario, testInfo) {
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({
      viewport: scenario.viewport, deviceScaleFactor: 1,
      locale: "he-IL", timezoneId: "Asia/Jerusalem", reducedMotion: "reduce", serviceWorkers: "block"
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
    await page.addInitScript(({ state, owner }) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem("settle-friends-current-participant", owner);
      localStorage.setItem("settle-friends-local-profile", JSON.stringify({
        participantId: owner, displayName: "בודק אחידות", avatarPreset: "avatar-1"
      }));
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    }, { state, owner: OWNER });
    const url = `${baseURL}/${scenario.font === 32 ? "?dynamic-type-preview=32" : ""}`;
    async function openHome() {
      await page.goto(url);
      await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
      if (scenario.ax) {
        await page.evaluate(() => {
          const root = document.documentElement;
          root.classList.add('dynamic-type-active', 'dynamic-type-apple', 'dynamic-type-extra-large');
          root.style.setProperty('--apple-font-scale', String(40 / 17));
          root.style.setProperty('font-size', '37.64706px', 'important');
        });
      }
    }
    await openHome();
    const records = {};
    records.home = await capture(page, testInfo, `${name}-home`, {
      description: ".product-home-screen .top .brand .muted", brand: ".product-brand-copy strong"
    });
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
    records.expenses = await capture(page, testInfo, `${name}-expenses`, {
      heading: ".event-overview-header h1", expense: ".expense-row strong",
      tab: ".event-workspace-tab strong"
    });
    await page.locator('[data-action="open-event-notes"]:visible').first().click();
    records.notes = await capture(page, testInfo, `${name}-notes`, {
      title: ".event-note-title-line strong", preview: ".event-note-preview"
    });
    await page.locator('[data-action="edit-profile"]:visible').first().click();
    records.profile = await capture(page, testInfo, `${name}-profile`, {
      name: ".profile-identity-copy strong"
    });
    await page.locator('[data-action="home"][data-nav-destination="home"]:visible').first().click();
    await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT}"]`).first().click();
    await page.locator(`[data-action="settle"][data-event-id="${EVENT}"]`).first().click();
    records.summary = await capture(page, testInfo, `${name}-summary`, {
      description: ".settlement-hero-title-row .muted",
      helper: ".settlement-stage-heading > div > small"
    });
    await page.locator('[data-action="open-event-participant-add"]').first().click();
    await page.locator('[data-action="open-event-share"]').first().click();
    await expect(page.locator(".event-share-link-status")).toHaveClass(/is-error/);
    records.share = await capture(page, testInfo, `${name}-share`, {
      unavailable: '[data-action="share-invite-whatsapp"]', copy: '[data-action="copy-invite"]'
    });
    await openHome();
    await page.locator('[data-action="new-event"]').first().click();
    await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
    await page.locator('[data-action="open-new-event-settlement"]').click();
    const picker = page.locator(".new-event-inline-picker").filter({ hasText: "חלוקת החזרים" });
    await picker.locator("summary").click();
    records.repayment = await capture(page, testInfo, `${name}-repayment`, {
      direct: '.new-event-inline-picker [data-action="new-event-repayment-choice"][data-choice-value="direct"] > span'
    });
    await picker.locator('[data-action="new-event-repayment-choice"][data-choice-value="direct"]').click();
    await expect(picker.locator("summary > span").first()).toHaveText("החזר לפי מי ששילם");
    records.selected = await capture(page, testInfo, `${name}-selected`, {
      direct: '.new-event-inline-picker:has([data-choice-value="direct"]) summary > span'
    });
    for (const [screen, record] of Object.entries(records)) {
      expect(parseFloat(record.rootFontSize), `${name}/${screen}: requested text scale`)
        .toBeCloseTo(scenario.font, 3);
    }
    expect(errors, `${name}: runtime errors`).toEqual([]);
    return { browserVersion: browser.version(), records };
  } finally {
    await browser.close();
  }
}

for (const scenario of [
  { label: "compact-320-default", viewport: { width: 320, height: 800 }, font: 16 },
  { label: "iphone-393-default", viewport: { width: 393, height: 852 }, font: 16 },
  { label: "iphone-393-32px", viewport: { width: 393, height: 852 }, font: 32 },
  { label: "iphone-393-AX-equivalent", viewport: { width: 393, height: 852 }, font: 37.64706, ax: true },
  { label: "landscape-852-default", viewport: { width: 852, height: 393 }, font: 16 },
  { label: "tablet-768-default", viewport: { width: 768, height: 1024 }, font: 16 }
]) {
  test(`same text, fonts and Hebrew word lines across engines: ${scenario.label}`, async ({ request, baseURL }, testInfo) => {
    test.setTimeout(150_000);
    const results = {};
    for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
      results[name] = await journey(engine, name, request, baseURL, scenario, testInfo);
    }
    await testInfo.attach("engine-measurements", { body: JSON.stringify({ scenario, results }, null, 2), contentType: "application/json" });
    for (const name of ["firefox", "webkit"]) {
      for (const [screen, baseline] of Object.entries(results.chromium.records)) {
        const actual = results[name].records[screen];
        expect(actual.viewport, `${name}/${screen}: actual viewport`).toEqual(baseline.viewport);
        expect(parseFloat(actual.rootFontSize), `${name}/${screen}: requested text scale`).toBeCloseTo(scenario.font, 3);
        for (const [target, expected] of Object.entries(baseline.metrics)) {
          const measured = actual.metrics[target];
          const label = `${scenario.label}/${name}/${screen}/${target}`;
          for (const field of ["text", "wordLines", "family", "weight", "color", "direction"]) {
            expect(measured[field], `${label}: ${field}`).toEqual(expected[field]);
          }
          expect(measured.size, `${label}: font size`).toBeCloseTo(expected.size, 3);
          if (expected.lineHeight === "normal") expect(measured.lineHeight, `${label}: line height`).toBe("normal");
          // Gecko quantizes layout to 1/60 CSS px (gfx/src/AppUnits.h).
          // Preserve the raw values and permit only that subpixel rounding;
          // words, rows, font size and the actual line boxes remain checked.
          else expect(Math.abs(measured.lineHeight - expected.lineHeight), `${label}: line height rounding`)
            .toBeLessThanOrEqual(1 / 60);
          // Browser line boxes round differently. Require exact words/rows and
          // allow at most one CSS pixel of box rounding per rendered line.
          expect(Math.abs(measured.width - expected.width), `${label}: width`).toBeLessThanOrEqual(1);
          expect(Math.abs(measured.height - expected.height), `${label}: height rounding`)
            .toBeLessThanOrEqual(Math.max(1, expected.wordLines.length));
        }
      }
    }
  });
}
