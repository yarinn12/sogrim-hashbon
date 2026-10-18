import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { openTypographyHome } from "./helpers/typographyReadiness.mjs";

test.use({ serviceWorkers: "block" });

const owner = "person-platform-visual-owner";
const eventId = "event-platform-visual-reference";
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "בודק עיצוב", kind: "user", avatarPreset: "avatar-1" }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
  events: [{
    id: eventId, name: "אירוע לדוגמה", eventType: "standard", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: "2026-10-13T13:46:00.000Z", updatedAt: "2026-10-13T13:46:00.000Z",
    expenses: [], transfers: [], notes: [], activityLog: []
  }]
};

test.beforeEach(async ({ page, request }) => {
  const reset = await request.post("/api/reset");
  expect(reset.ok(), `visual fixture reset failed: ${await reset.text()}`).toBe(true);
  const seed = await request.put("/api/state", { data: state });
  expect(seed.ok(), `visual fixture seed failed: ${await seed.text()}`).toBe(true);
  const stored = await request.get("/api/state");
  expect(stored.ok(), `visual fixture readback failed: ${await stored.text()}`).toBe(true);
  expect(await stored.json(), "server retained the exact synthetic visual fixture").toEqual(state);
  await page.addInitScript(({ owner, state }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner, displayName: "בודק עיצוב", avatarPreset: "avatar-1"
    }));
    localStorage.setItem("settle-friends-current-participant", owner);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { owner, state });
  await page.setViewportSize({ width: 411, height: 866 });
  await openTypographyHome(page);
});

async function recordMeasurement(testInfo, name, value) {
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2));
  await testInfo.attach(name, { path, contentType: "application/json" });
}

function assertActualPointer(reading, testInfo) {
  const profiles = {
    'android-mobile': { coarse: true, fine: false },
    'iphone-webkit': { coarse: true, fine: false },
    'ipad-webkit': { coarse: true, fine: false },
    'iphone-large-text': { coarse: true, fine: false },
    'reflow-200': { coarse: false, fine: true },
    'desktop-chromium': { coarse: false, fine: true },
    'desktop-webkit': { coarse: false, fine: true },
    'desktop-firefox': { coarse: false, fine: true },
    'compact-firefox': { coarse: false, fine: true }
  };
  const expected = profiles[testInfo.project.name];
  expect(expected, `unknown browser pointer profile ${testInfo.project.name}`).toBeDefined();
  expect(reading.pointer, `${testInfo.project.name}: actual pointer media, not a mock`).toEqual(expected);
}

async function readHeading(page, selector) {
  return page.locator(selector).evaluate(heading => {
    const screen = heading.closest(".screen");
    const top = heading.closest(".top");
    const eyebrow = top?.querySelector(".brand > .eyebrow");
    const headingRect = heading.getBoundingClientRect();
    const topRect = top?.getBoundingClientRect();
    const glyphLines = new Set();
    const text = heading.firstChild;
    if (text?.nodeType === Node.TEXT_NODE) {
      for (let index = 0; index < text.length; index += 1) {
        if (!text.data[index].trim()) continue;
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) glyphLines.add(Math.round(rect.top));
      }
    }
    const eyebrowRect = eyebrow?.getBoundingClientRect();
    const eyebrowStyle = eyebrow && getComputedStyle(eyebrow);
    return {
      text: heading.textContent.trim(),
      fontSize: parseFloat(getComputedStyle(heading).fontSize),
      lineCount: glyphLines.size,
      headingRect: headingRect.toJSON(),
      topRect: topRect?.toJSON(),
      eyebrowVisible: Boolean(eyebrow && eyebrowStyle.display !== "none"
        && eyebrowStyle.visibility !== "hidden" && eyebrowRect.width > 0 && eyebrowRect.height > 0),
      viewport: { width: innerWidth, height: innerHeight },
      orientation: matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape",
      pointer: {
        coarse: matchMedia("(pointer: coarse)").matches,
        fine: matchMedia("(pointer: fine)").matches
      },
      rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      dynamicType: document.documentElement.dataset.dynamicType,
      documentWidth: document.documentElement.scrollWidth,
      screenWidth: screen?.getBoundingClientRect().width
    };
  });
}

function assertReferenceContext(reading, viewport, testInfo) {
  expect(reading.viewport).toEqual(viewport);
  expect(reading.orientation).toBe("portrait");
  assertActualPointer(reading, testInfo);
  expect(reading.rootFontSize).toBe(16);
  expect(reading.dynamicType).toBe("normal");
  expect(reading.documentWidth).toBeLessThanOrEqual(reading.viewport.width + 1);
}

for (const viewport of [{ width: 393, height: 852 }, { width: 411, height: 866 }]) test(`Android 4.57 reference keeps the home title on one line at ${viewport.width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  const heading = await readHeading(page, ".product-home-screen .top .brand h1");
  const action = await page.locator(".home-create-event-action").evaluate(node => {
    const action = node.getBoundingClientRect();
    const hero = document.querySelector(".product-home-screen > .top").getBoundingClientRect();
    return { action: action.toJSON(), hero: hero.toJSON(), textFits: node.scrollWidth <= node.clientWidth + 1 };
  });
  await recordMeasurement(testInfo, "reference-home-context", { heading, action });
  await testInfo.attach("reference-home-screen", {
    body: await page.screenshot({ fullPage: true }), contentType: "image/png"
  });
  assertReferenceContext(heading, viewport, testInfo);
  expect(heading.text).toBe("מה סוגרים היום?");
  expect(heading.fontSize, "the accepted 4.57 compact phone heading uses the authored 1.5rem size").toBeCloseTo(24, 1);
  expect(heading.lineCount, "the complete home question stays on one rendered line").toBe(1);
  expect(heading.eyebrowVisible, "the hero has no extra greeting tag").toBe(false);
  expect(heading.headingRect.left).toBeGreaterThanOrEqual(heading.topRect.left - 1);
  expect(heading.headingRect.right).toBeLessThanOrEqual(heading.topRect.right + 1);
  expect(action.textFits).toBe(true);
  expect(action.action.height, "new event stays a usable touch target").toBeGreaterThanOrEqual(44);
  expect(Math.abs((action.action.left + action.action.right) / 2
    - (action.hero.left + action.hero.right) / 2), "new event is centered on the hero").toBeLessThanOrEqual(3);
  expect(action.action.top, "new event crosses the hero edge as in the reference").toBeLessThan(action.hero.bottom);
  expect(action.action.bottom).toBeGreaterThan(action.hero.bottom);
});

test("shared phone headings use the same compact hierarchy across routes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const readings = [{ view: "home", ...await readHeading(page, ".product-home-screen .top .brand h1") }];
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();
  readings.push({ view: "event", ...await readHeading(page, ".event-overview-header h1") });
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('[data-screen-kind="event-notes"]')).toBeVisible();
  readings.push({ view: "notes", ...await readHeading(page, '[data-screen-kind="event-notes"] .top h1') });
  await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  readings.push({ view: "profile", ...await readHeading(page, '[data-screen-kind="profile"] .top h1') });
  await page.locator('.product-app-nav [data-nav-destination="home"]').click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator(`.event-workspace-summary[data-action="settle"][data-event-id="${eventId}"]`).click();
  await expect(page.locator('.screen[data-event-view="summary"]')).toBeVisible();
  readings.push({ view: "summary", ...await readHeading(page,
    '.screen[data-event-view="summary"] .event-overview-header h1') });
  await page.locator('.product-app-nav [data-nav-destination="notifications"]').click();
  await expect(page.locator('[data-screen-kind="notifications"]')).toBeVisible();
  readings.push({ view: "notifications", ...await readHeading(page,
    '[data-screen-kind="notifications"] .top h1') });
  await page.locator('.product-app-nav [data-nav-destination="home"]').click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator('[data-screen-kind="home"] [data-action="groups"]').click();
  await expect(page.locator('[data-screen-kind="groups"]')).toBeVisible();
  readings.push({ view: "friends", ...await readHeading(page,
    '[data-screen-kind="groups"] .top h1') });
  await recordMeasurement(testInfo, "reference-heading-matrix", readings);
  for (const reading of readings) {
    assertReferenceContext(reading, { width: 393, height: 852 }, testInfo);
    expect.soft(reading.fontSize, `${reading.view}: the same compact authored phone size`).toBeCloseTo(24, 1);
    expect.soft(reading.eyebrowVisible, `${reading.view}: no extra greeting tag`).toBe(false);
    expect.soft(reading.headingRect.left, `${reading.view}: heading begins inside its card`).toBeGreaterThanOrEqual(reading.topRect.left - 1);
    expect.soft(reading.headingRect.right, `${reading.view}: heading ends inside its card`).toBeLessThanOrEqual(reading.topRect.right + 1);
  }
});

test("short landscape keeps the shared title, tabs, notes intro, and expense form usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 914, height: 393 });
  const home = await readHeading(page, ".product-home-screen .top .brand h1");
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();
  const event = await readHeading(page, ".event-overview-header h1");
  const tabs = await page.locator(".event-workspace-tab").evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    const label = node.querySelector("strong");
    return { text: label?.textContent.trim(), height: rect.height, width: rect.width,
      fontSize: parseFloat(getComputedStyle(label).fontSize),
      labelFits: label.scrollWidth <= label.clientWidth + 1 };
  }));
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.locator('[data-screen-kind="event-notes"]')).toBeVisible();
  const notes = await readHeading(page, '[data-screen-kind="event-notes"] .top h1');
  const notesIntro = await page.locator(".event-notes-intro").evaluate(node => ({
    display: getComputedStyle(node).display,
    flexDirection: getComputedStyle(node).flexDirection,
    width: node.getBoundingClientRect().width,
    scrollWidth: node.scrollWidth,
    buttonHeight: document.querySelector('[data-action="new-event-note"]')?.getBoundingClientRect().height
  }));
  await page.locator(".event-workspace-expenses").click();
  await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();
  await page.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first().click();
  const expense = await page.locator(".expense-step-modal").evaluate(node => {
    const heading = node.querySelector(".expense-modal-step-header h2");
    const eyebrow = node.querySelector(".expense-modal-step-header .eyebrow");
    const eyebrowRect = eyebrow?.getBoundingClientRect();
    const button = node.querySelector('[data-action="expense-step-next"]');
    return { title: heading?.textContent.trim(), titleSize: parseFloat(getComputedStyle(heading).fontSize),
      eyebrowVisible: Boolean(eyebrow && getComputedStyle(eyebrow).display !== "none"
        && eyebrowRect.width > 0 && eyebrowRect.height > 0),
      actionHeight: button?.getBoundingClientRect().height,
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth };
  });
  await recordMeasurement(testInfo, "reference-landscape-matrix", { home, event, tabs, notes, notesIntro, expense });
  await testInfo.attach("reference-landscape-expense", {
    body: await page.screenshot(), contentType: "image/png"
  });
  for (const reading of [home, event, notes]) {
    expect(reading.viewport).toEqual({ width: 914, height: 393 });
    expect(reading.orientation).toBe("landscape");
    assertActualPointer(reading, testInfo);
    expect.soft(reading.fontSize, "short landscape uses the authored 1.25rem title").toBeCloseTo(20, 1);
    expect.soft(reading.eyebrowVisible, "short landscape omits the extra tag").toBe(false);
    expect(reading.documentWidth).toBeLessThanOrEqual(915);
  }
  expect(tabs).toHaveLength(3);
  for (const tab of tabs) {
    expect(tab.height, `${tab.text}: landscape touch target`).toBeGreaterThanOrEqual(44);
    expect(tab.height, `${tab.text}: compact phone landscape tab`).toBeLessThanOrEqual(50);
    expect(tab.labelFits, `${tab.text}: full tab label`).toBe(true);
  }
  expect(notesIntro.scrollWidth).toBeLessThanOrEqual(notesIntro.width + 1);
  expect(notesIntro.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(expense.viewport).toEqual({ width: 914, height: 393 });
  expect(expense.documentWidth).toBeLessThanOrEqual(915);
  expect.soft(expense.titleSize, "short landscape expense title stays compact").toBeCloseTo(20, 1);
  expect.soft(expense.eyebrowVisible, "short landscape expense form omits the extra tag").toBe(false);
  expect(expense.actionHeight).toBeGreaterThanOrEqual(44);
});

test("the 1024px short landscape edge stays compact for the actual pointer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 400 });
  const heading = await readHeading(page, ".product-home-screen .top .brand h1");
  await recordMeasurement(testInfo, "short-landscape-edge", heading);
  expect(heading.viewport).toEqual({ width: 1024, height: 400 });
  expect(heading.orientation).toBe("landscape");
  assertActualPointer(heading, testInfo);
  expect(heading.documentWidth).toBeLessThanOrEqual(1025);
  expect(heading.fontSize).toBeCloseTo(20, 1);
  expect(heading.eyebrowVisible).toBe(false);
});

test("wide 1280 by 400 layout keeps its desktop hierarchy for the actual pointer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  const heading = await readHeading(page, ".product-home-screen .top .brand h1");
  await recordMeasurement(testInfo, "wide-short-pointer-context", heading);
  await testInfo.attach("wide-short-screen", {
    body: await page.screenshot(), contentType: "image/png"
  });
  expect(heading.viewport).toEqual({ width: 1280, height: 400 });
  expect(heading.orientation).toBe("landscape");
  assertActualPointer(heading, testInfo);
  expect(heading.rootFontSize).toBe(16);
  expect(heading.documentWidth).toBeLessThanOrEqual(1281);
  expect(heading.fontSize, "desktop layout remains wide at 1280px regardless of pointer")
    .toBeCloseTo(48, 1);
  expect(heading.eyebrowVisible, "desktop retains its desktop secondary label").toBe(true);
});

test("geometry across tablet and desktop breakpoints preserves screen and hero proportions", async ({ page }, testInfo) => {
  const samples = [];
  for (const viewport of [
    { width: 721, height: 900 }, { width: 914, height: 393 },
    { width: 1024, height: 400 }, { width: 1025, height: 900 },
    { width: 1280, height: 400 }, { width: 1366, height: 900 },
    { width: 1367, height: 900 }, { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    // WebKit can report the new innerWidth before dispatching resize to the app.
    const tabletViewport = viewport.width >= 721 && viewport.width <= 1366;
    const root = page.locator("html");
    if (tabletViewport) {
      await expect(root, `${viewport.width}px: tablet shell follows viewport resize`)
        .toHaveClass(/\bresponsive-tablet-shell\b/);
    } else {
      await expect(root, `${viewport.width}px: desktop shell follows viewport resize`)
        .not.toHaveClass(/\bresponsive-tablet-shell\b/);
    }
    const home = await page.locator('.screen[data-screen-kind="home"]').evaluate(screen => {
      const hero = screen.querySelector(':scope > .top');
      const action = screen.querySelector('.home-create-event-action');
      const rect = element => element?.getBoundingClientRect().toJSON();
      return { viewport: { width: innerWidth, height: innerHeight },
        pointer: { coarse: matchMedia('(pointer: coarse)').matches,
          fine: matchMedia('(pointer: fine)').matches },
        screen: rect(screen), hero: rect(hero), action: rect(action),
        screenPadding: { left: parseFloat(getComputedStyle(screen).paddingLeft),
          right: parseFloat(getComputedStyle(screen).paddingRight) },
        documentWidth: document.documentElement.scrollWidth };
    });
    await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
    const event = await page.locator('.screen[data-screen-kind="event"]').evaluate(screen => {
      const hero = screen.querySelector('.event-overview-header');
      const tabs = [...screen.querySelectorAll('.event-workspace-tab')];
      const rect = element => element?.getBoundingClientRect().toJSON();
      const title=hero.querySelector('h1'), actions=hero.querySelector('.event-header-actions');
      const titleBounds=title.getBoundingClientRect(), actionsBounds=actions.getBoundingClientRect();
      const heroBounds=hero.getBoundingClientRect();
      const leaves=[title,...hero.querySelectorAll('.event-header-meta,.event-header-action-label')].map(element=>{
        const range=document.createRange();range.selectNodeContents(element);
        const glyphs=[...range.getClientRects()].filter(g=>g.width&&g.height);
        return {text:element.textContent.trim(),fits:glyphs.length>0&&glyphs.every(g=>
          g.left>=heroBounds.left&&g.right<=heroBounds.right&&g.top>=heroBounds.top&&g.bottom<=heroBounds.bottom)};
      });
      const utilityButtons=[...actions.querySelectorAll('button')].map(button=>({rect:rect(button)}));
      return { title:rect(title), actions:rect(actions), leaves, utilityButtons,
        heroPadding:parseFloat(getComputedStyle(hero).paddingBottom),
        screen: rect(screen), hero: rect(hero), tabs: tabs.map(tab => ({
        text: tab.querySelector('strong')?.textContent.trim(), rect: rect(tab) })) };
    });
    samples.push({ viewport, home, event });
    await page.locator('.product-app-nav [data-nav-destination="home"]').click();
    await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
  }
  await recordMeasurement(testInfo, "breakpoint-geometry", samples);
  for (const sample of samples) {
    expect(sample.home.viewport).toEqual(sample.viewport);
    assertActualPointer(sample.home, testInfo);
    expect(sample.home.documentWidth).toBeLessThanOrEqual(sample.viewport.width + 1);
    expect(sample.event.tabs).toHaveLength(3);
    const { width, height } = sample.viewport;
    const tablet = width >= 721 && width <= 1366;
    const phoneLandscape = width <= 1024 && height <= 450;
    const expectedScreen = tablet ? Math.min(width - 32, 960) : 448;
    const expectedHero = expectedScreen - (tablet ? 48 : 40);
    const expectedHomeHeight = phoneLandscape ? 63 : tablet ? 180 : 205;
    // The approved event header is content-sized. Preserve exact content
    // containment,44px utility actions and trailing padding rather than the
    // retired fixed188px hero height.
    expect(sample.event.leaves.every(leaf=>leaf.fits),`${width}px: every header glyph is inside the hero`).toBe(true);
    expect(sample.event.title.bottom).toBeLessThanOrEqual(sample.event.actions.top);
    expect(Math.abs(sample.event.hero.bottom-sample.event.actions.bottom-sample.event.heroPadding),
      `${width}px: no unexplained empty header block`).toBeLessThanOrEqual(2);
    expect(sample.event.utilityButtons).toHaveLength(3);
    expect(sample.event.leaves).toHaveLength(5);
    for(const button of sample.event.utilityButtons) {
      expect(button.rect.width).toBeGreaterThanOrEqual(44);expect(button.rect.height).toBeGreaterThanOrEqual(44);
      expect(button.rect.left).toBeGreaterThanOrEqual(sample.event.hero.left);
      expect(button.rect.right).toBeLessThanOrEqual(sample.event.hero.right);
    }
    const expectedTabHeight = phoneLandscape ? 44 : 56;
    for (const [name, measured, expected] of [
      ["home screen width", sample.home.screen.width, expectedScreen],
      ["event screen width", sample.event.screen.width, expectedScreen],
      ["home hero width", sample.home.hero.width, expectedHero],
      ["event hero width", sample.event.hero.width, expectedHero],
      ["home hero height", sample.home.hero.height, expectedHomeHeight],
      ["home action width", sample.home.action.width, tablet ? 240 : 174]
    ]) expect.soft(Math.abs(measured - expected), `${width}×${height}: ${name}`).toBeLessThanOrEqual(2);
    const actionCenter = (sample.home.action.left + sample.home.action.right) / 2;
    const heroCenter = (sample.home.hero.left + sample.home.hero.right) / 2;
    expect.soft(Math.abs(actionCenter - heroCenter), `${width}×${height}: action centered over hero`).toBeLessThanOrEqual(3);
    expect.soft(Math.abs((sample.home.action.top + sample.home.action.bottom) / 2
      - sample.home.hero.bottom), `${width}×${height}: action overlaps hero edge`).toBeLessThanOrEqual(3);
    expect.soft(Math.abs(sample.home.screen.left - (width - expectedScreen) / 2),
      `${width}×${height}: home screen centered`).toBeLessThanOrEqual(2);
    expect.soft(Math.abs(sample.event.screen.left - (width - expectedScreen) / 2),
      `${width}×${height}: event screen centered`).toBeLessThanOrEqual(2);
    for (const tab of sample.event.tabs) {
      expect.soft(tab.rect.height, `${width}×${height}: ${tab.text} tab height`).toBeGreaterThanOrEqual(44);
      expect.soft(Math.abs(tab.rect.height - expectedTabHeight),
        `${width}×${height}: ${tab.text} tab proportion`).toBeLessThanOrEqual(2);
      expect.soft(Math.abs(tab.rect.width - (expectedHero - 27) / 3),
        `${width}×${height}: ${tab.text} tab width`).toBeLessThanOrEqual(2);
      expect.soft(Math.abs(tab.rect.top - sample.event.hero.bottom - (phoneLandscape ? 17 : 18)),
        `${width}×${height}: ${tab.text} tab placement`).toBeLessThanOrEqual(2);
    }
  }
});

test("tablet expense modal stays inside the wide canvas at 1025 through 1366px", async ({ page }, testInfo) => {
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();
  await page.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first().click();
  const modal = page.locator('.expense-step-modal');
  await expect(modal).toBeVisible();
  const samples = [];
  for (const width of [1025, 1280, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await modal.evaluate(node => {
      const rect = element => element?.getBoundingClientRect().toJSON();
      const nav = document.querySelector('.event-route-primary-nav');
      const action = node.querySelector('[data-action="expense-step-next"]');
      const backdrop = node.closest('.expense-modal-backdrop');
      return { viewport: { width: innerWidth, height: innerHeight },
        pointer: { coarse: matchMedia('(pointer: coarse)').matches,
          fine: matchMedia('(pointer: fine)').matches },
        modal: rect(node), backdrop: rect(backdrop), nav: rect(nav), action: rect(action),
        documentWidth: document.documentElement.scrollWidth };
    });
    samples.push(geometry);
  }
  await recordMeasurement(testInfo, 'tablet-expense-modal', samples);
  for (const geometry of samples) {
    const { width } = geometry.viewport;
    assertActualPointer(geometry, testInfo);
    expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1);
    expect.soft(Math.abs(geometry.modal.width - 960), `${width}px: wide tablet modal`).toBeLessThanOrEqual(2);
    expect.soft(Math.abs((geometry.modal.left + geometry.modal.right) / 2 - width / 2),
      `${width}px: centered modal`).toBeLessThanOrEqual(2);
    expect.soft(geometry.modal.top, `${width}px: modal top`).toBeGreaterThanOrEqual(0);
    expect.soft(geometry.modal.top, `${width}px: modal starts near top`).toBeLessThanOrEqual(24);
    expect.soft(geometry.modal.bottom, `${width}px: modal above navigation`).toBeLessThanOrEqual(geometry.nav.top + 4);
    expect.soft(geometry.action.height, `${width}px: next action touch target`).toBeGreaterThanOrEqual(44);
    expect.soft(geometry.action.top, `${width}px: next action visible`).toBeGreaterThanOrEqual(geometry.modal.top - 1);
    expect.soft(geometry.action.bottom, `${width}px: next action inside modal`).toBeLessThanOrEqual(geometry.modal.bottom + 1);
    expect.soft(geometry.backdrop.left, `${width}px: backdrop fills viewport`).toBeLessThanOrEqual(1);
    expect.soft(geometry.backdrop.right, `${width}px: backdrop fills viewport`).toBeGreaterThanOrEqual(width - 1);
  }
});

test("tablet authentication gate keeps its own reachable scroll surface", async ({ context, baseURL }, testInfo) => {
  const gatePage = await context.newPage();
  const authOrigin = 'https://visual-auth-gate.supabase.co';
  await gatePage.route('**/api/config*', route => route.fulfill({ json: {
    publicUrl: baseURL,
    storage: { mode: 'supabase', url: authOrigin, anonKey: 'synthetic-key', table: 'app_snapshots' },
    launch: { googleAuthReady: false, authEmailDeliveryReady: true }
  } }));
  await gatePage.route(`${authOrigin}/**`, route => route.fulfill({
    headers: { 'access-control-allow-origin': '*' }, json: []
  }));
  await gatePage.addInitScript(() => {
    localStorage.clear(); sessionStorage.clear();
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  });
  const samples = [];
  for (const width of [1025, 1280, 1366]) {
    await gatePage.setViewportSize({ width, height: 900 });
    await gatePage.goto('/');
    const gate = gatePage.locator('#public-account-auth-gate');
    await expect(gate).toBeVisible();
    await gatePage.evaluate(() => document.fonts.ready);
    const geometry = await gate.evaluate(node => {
      const rect = element => element?.getBoundingClientRect().toJSON();
      const shell = node.querySelector('.account-auth-shell');
      const submit = node.querySelector('.account-auth-submit');
      return { viewport: { width: innerWidth, height: innerHeight },
        pointer: { coarse: matchMedia('(pointer: coarse)').matches,
          fine: matchMedia('(pointer: fine)').matches },
        gate: rect(node), shell: rect(shell), submit: rect(submit),
        gatePosition: getComputedStyle(node).position,
        gateOverflow: getComputedStyle(node).overflowY,
        shellOverflow: getComputedStyle(shell).overflowY,
        documentWidth: document.documentElement.scrollWidth };
    });
    samples.push(geometry);
  }
  await recordMeasurement(testInfo, 'tablet-auth-gate', samples);
  for (const geometry of samples) {
    const { width, height } = geometry.viewport;
    assertActualPointer(geometry, testInfo);
    expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(geometry.gatePosition).toBe('fixed');
    expect(geometry.gateOverflow).toBe('auto');
    expect.soft(geometry.shellOverflow, `${width}px: shell does not trap legal content`).toBe('visible');
    expect.soft(geometry.gate.left, `${width}px: gate covers left edge`).toBeLessThanOrEqual(1);
    expect.soft(geometry.gate.right, `${width}px: gate covers right edge`).toBeGreaterThanOrEqual(width - 1);
    expect.soft(geometry.gate.bottom, `${width}px: gate covers bottom edge`).toBeGreaterThanOrEqual(height - 1);
    expect.soft(geometry.shell.left, `${width}px: shell inside viewport`).toBeGreaterThanOrEqual(0);
    expect.soft(geometry.shell.right, `${width}px: shell inside viewport`).toBeLessThanOrEqual(width);
    expect.soft(geometry.submit.height, `${width}px: submit touch target`).toBeGreaterThanOrEqual(44);
  }
  await gatePage.close();
});

test("tablet participant roster owns the scrollport above navigation", async ({ context, request }, testInfo) => {
  const participants = [state.participants[0], ...Array.from({ length: 15 }, (_, index) => ({
    id: `person-visual-roster-${index + 1}`,
    displayName: `משתתף מספר ${index + 1} עם שם משפחה ארוך לאירוע המשותף`,
    kind: 'guest'
  }))];
  const rosterState = { ...state, participants, events: [{ ...state.events[0],
    name: 'אירוע משותף עם רשימת משתתפים ארוכה לבדיקת גלילה',
    participantIds: participants.map(participant => participant.id) }] };
  const seed = await request.put('/api/state', { data: rosterState });
  expect(seed.ok(), `roster fixture seed failed: ${await seed.text()}`).toBe(true);
  const stored = await request.get('/api/state');
  expect(stored.ok()).toBe(true);
  expect(await stored.json()).toEqual(rosterState);
  const rosterPage = await context.newPage();
  await rosterPage.addInitScript(({ owner, nextState }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(nextState));
    localStorage.setItem('settle-friends-current-participant', owner);
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({
      participantId: owner, displayName: 'בודק עיצוב', avatarPreset: 'avatar-1'
    }));
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  }, { owner, nextState: rosterState });
  await rosterPage.setViewportSize({ width: 1280, height: 900 });
  await openTypographyHome(rosterPage, { path: '/?dynamic-type-preview=32' });
  await expect(rosterPage.locator('html')).toHaveCSS('font-size', '32px');
  await rosterPage.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await expect(rosterPage.locator('[data-screen-kind="event"]')).toBeVisible();
  await rosterPage.locator('[data-action="open-event-participants"]:visible').first().click();
  const roster = rosterPage.locator('.event-participant-roster-modal');
  await expect(roster).toBeVisible();
  await expect(roster.locator('.event-participant-roster-row')).toHaveCount(participants.length);
  const samples = [];
  for (const width of [1025, 1280, 1366]) {
    await rosterPage.setViewportSize({ width, height: 900 });
    await rosterPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await roster.evaluate(node => { node.scrollTop = 0; });
    const before = await roster.evaluate(node => {
      const panel = node.getBoundingClientRect();
      const nav = [...document.querySelectorAll('.product-app-nav')]
        .map(element => element.getBoundingClientRect())
        .find(rect => rect.width > 0 && rect.height > 0);
      return { viewport: { width: innerWidth, height: innerHeight },
        pointer: { coarse: matchMedia('(pointer: coarse)').matches,
          fine: matchMedia('(pointer: fine)').matches },
        panel: panel.toJSON(), nav: nav?.toJSON(),
        overflowY: getComputedStyle(node).overflowY,
        scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
    });
    const last = roster.locator('.event-participant-roster-row').last();
    await last.scrollIntoViewIfNeeded();
    const scrollTop = await roster.evaluate(node => node.scrollTop);
    await expect(last).toBeInViewport();
    samples.push({ ...before, scrollTop, lastVisible: true });
  }
  await recordMeasurement(testInfo, 'tablet-roster-scrollport', samples);
  for (const geometry of samples) {
    const { width } = geometry.viewport;
    assertActualPointer(geometry, testInfo);
    expect(geometry.nav, `${width}px: navigation measured`).toBeDefined();
    expect.soft(geometry.panel.bottom, `${width}px: roster above navigation`)
      .toBeLessThanOrEqual(geometry.nav.top + 1);
    expect.soft(geometry.overflowY, `${width}px: roster owns scrolling`).toBe('auto');
    expect.soft(geometry.scrollHeight, `${width}px: roster exceeds scrollport`)
      .toBeGreaterThan(geometry.clientHeight);
    expect.soft(geometry.scrollTop, `${width}px: final participant is reachable`).toBeGreaterThan(0);
    expect.soft(geometry.panel.left, `${width}px: roster stays in viewport`).toBeGreaterThanOrEqual(0);
    expect.soft(geometry.panel.right, `${width}px: roster stays in viewport`).toBeLessThanOrEqual(width);
  }
  await rosterPage.close();
});

test("extra-large text keeps complete Events and Archive labels at393and320px",async({page},testInfo)=>{
 await page.locator(".product-app-identity [data-open-accessibility]").click();
 const center=page.locator('.accessibility-center[role="dialog"]');
 await center.locator('[value="extra-large"]').check();
 await page.locator('[data-close-accessibility]').first().click();
 await expect(page.locator('html')).toHaveAttribute('data-accessibility-text-size','extra-large');
 const filter=page.getByRole('group',{name:'אירועים וארכיון',exact:true});
 for(const width of [393,320]) {
  await page.setViewportSize({width,height:852});await page.evaluate(()=>document.fonts.ready);
  const readings=await filter.locator('button').evaluateAll(buttons=>buttons.map(button=>{
   const label=button.querySelector('span'), text=label.firstChild, glyphs=[];
   for(let i=0;i<text.length;i++) {
    if(!text.data[i].trim())continue;
    const r=document.createRange();r.setStart(text,i);r.setEnd(text,i+1);glyphs.push(r.getBoundingClientRect());
   }
   const bounds=button.getBoundingClientRect(),last=glyphs.at(-1);
   const hit=last&&document.elementFromPoint((last.left+last.right)/2,(last.top+last.bottom)/2);
   return {text:label.textContent.trim(),font:parseFloat(getComputedStyle(label).fontSize),
    root:parseFloat(getComputedStyle(document.documentElement).fontSize),rect:bounds.toJSON(),
    lines:new Set(glyphs.map(g=>Math.round(g.top))).size,
    fullWord:glyphs.length===[...text.data].filter(c=>c.trim()).length&&glyphs.every(g=>
     g.left>=bounds.left-1&&g.right<=bounds.right+1&&g.top>=bounds.top-1&&g.bottom<=bounds.bottom+1),
    lastGlyphHit:Boolean(hit&&button.contains(hit)),overflow:button.scrollWidth-button.clientWidth};
  }));
  expect(readings.map(r=>r.text)).toEqual(['אירועים','ארכיון']);
  expect(Math.abs(readings[0].rect.width-readings[1].rect.width)).toBeLessThanOrEqual(1);
  for(const reading of readings) {
   expect(reading.root).toBe(20);expect(reading.font).toBeGreaterThanOrEqual(14*20/16);
   expect(reading.lines).toBe(1);expect(reading.fullWord).toBe(true);expect(reading.lastGlyphHit).toBe(true);
   expect(reading.rect.width).toBeGreaterThanOrEqual(44);expect(reading.rect.height).toBeGreaterThanOrEqual(44);
   expect(reading.overflow).toBeLessThanOrEqual(1);
  }
  for(const [name,count] of [['ארכיון',0],['אירועים',1]]) {
   const control=filter.getByRole('button',{name,exact:true});await control.click();
   await expect(control).toHaveAttribute('aria-pressed','true');await expect(page.locator('.event-row')).toHaveCount(count);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await recordMeasurement(testInfo,`extra-large-event-tabs-${width}`,readings);
 }
});
