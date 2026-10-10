// Adapted from the source-379 macOS font probe for the immutable combined
// candidate. This file only observes the app; it never changes its CSS.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import os from "node:os";

const candidateCommit = "05496645041e51baed22c6d878116329ad3d1813";
const candidateTree = "ad2457eed3d8d33be238f64278d5f69f86b84b49";
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const appRoot = process.env.FONT_PARITY_APP_ROOT || join(root, "app");
const dependencyRoot = process.env.FONT_PARITY_DEPENDENCY_ROOT || appRoot;
const { chromium, webkit } = await import(pathToFileURL(
  join(dependencyRoot, "node_modules/playwright/index.mjs")
).href);
const { calculateSettlement } = await import(pathToFileURL(
  join(appRoot, "src/domain/settlement.mjs")
).href);
const origin = process.env.FONT_PARITY_ORIGIN || "http://127.0.0.1:4287";
const output = join(root, "font-parity-evidence");
await mkdir(output, { recursive: true });

const fixtureSource = await readFile(join(appRoot, "e2e/mobile-layout.spec.mjs"), "utf8");
const fixtureCode = fixtureSource.slice(
  fixtureSource.indexOf("const EVENT_ID ="),
  fixtureSource.indexOf("test.beforeEach(")
);
const { seededState, EVENT_ID, OWNER_ID } = Function(
  "calculateSettlement",
  `${fixtureCode}\nreturn { seededState, EVENT_ID, OWNER_ID };`
)(calculateSettlement);
const localCss = await readFile(join(appRoot, "assets/fonts/local.css"), "utf8");
const fontFiles = (await readdir(join(appRoot, "assets/fonts"))).filter(name => name.endsWith(".woff2"));
const index = await readFile(join(appRoot, "index.html"), "utf8");
const issues = [];
if (!index.includes('href="./assets/fonts/local.css?pwa_release=511"')) {
  issues.push("The exact candidate index does not load the local font stylesheet.");
}
for (const name of fontFiles) {
  if (!localCss.includes(name)) issues.push(`Local font CSS does not reference ${name}.`);
}
if (fontFiles.length !== 13) issues.push(`Expected 13 local WOFF2 subsets, found ${fontFiles.length}.`);

const records = [];
for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const mode of ["normal", "external-fonts-blocked"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
        isMobile: true, hasTouch: true, locale: "he-IL",
        reducedMotion: "reduce", serviceWorkers: "block"
      });
      const record = { engine, mode, browserVersion: browser.version(), errors: [], fontRequests: [] };
      try {
        await context.route("**/*", route => {
          const url = new URL(route.request().url());
          if (url.hostname === "127.0.0.1") return route.continue();
          if (mode === "external-fonts-blocked" &&
              ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
            return route.abort("internetdisconnected");
          }
          return route.abort();
        });
        record.weights = await readWeightControl(context, engine, mode);
        const reset = await context.request.post(`${origin}/api/reset`);
        const seed = await context.request.put(`${origin}/api/state`, { data: seededState });
        if (!reset.ok() || !seed.ok()) throw new Error("Synthetic local state reset or seed failed.");

        const page = await context.newPage();
        page.on("pageerror", error => record.errors.push(error.message));
        page.on("request", request => {
          if (/\/assets\/fonts\/|fonts\.(?:googleapis|gstatic)\.com/.test(request.url())) {
            record.fontRequests.push(request.url());
          }
        });
        await page.addInitScript(({ state, owner }) => {
          localStorage.clear();
          sessionStorage.clear();
          localStorage.setItem("settle-friends-state", JSON.stringify(state));
          localStorage.setItem("settle-friends-local-profile", JSON.stringify({
            participantId: owner, displayName: "ירין יצחק", avatarPreset: "avatar-1"
          }));
          localStorage.setItem("settle-friends-current-participant", owner);
          sessionStorage.setItem("settle-friends-skip-next-splash", "1");
        }, { state: seededState, owner: OWNER_ID });
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().waitFor({ state: "visible" });
        record.homeFontProof = await loadExactRubik(page, [".product-home-screen .top .brand .muted"]);
        record.home = {
          rasterFlags: await readRasterFlags(page),
          copy: await readWordLines(page, [".product-home-screen .top .brand .muted"])
        };
        record.homeScreenshot = await capture(page, `${engine}-${mode}-home.png`);

        await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
        await page.locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`).first().click();
        await page.locator('[data-event-view="summary"]').waitFor({ state: "visible" });
        record.summaryFontProof = await loadExactRubik(page, [
          ".settlement-hero .muted", ".settlement-stage-heading > div > small"
        ]);
        record.summary = [];
        for (const width of [360, 375, 390, 430]) {
          await page.setViewportSize({ width, height: 844 });
          await page.evaluate(() => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          ));
          record.summary.push({
            width,
            rasterFlags: await readRasterFlags(page),
            copy: await readWordLines(page, [
              ".settlement-hero .muted", ".settlement-stage-heading > div > small"
            ])
          });
          if (width === 390) {
            record.summaryScreenshot = await capture(page, `${engine}-${mode}-summary.png`);
          }
        }
        record.loadedFaces = await page.evaluate(() => [...document.fonts]
          .filter(face => face.status === "loaded")
          .map(face => ({ family: face.family, weight: face.weight, range: face.unicodeRange })));
        await page.close();
      } catch (error) {
        record.failure = String(error?.stack || error);
        issues.push(`${engine}/${mode}: ${error.message}`);
      } finally {
        records.push(record);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

for (const record of records.filter(row => !row.failure)) {
  if (record.errors.length) issues.push(`${record.engine}/${record.mode}: browser errors: ${record.errors.join("; ")}`);
  if (!record.fontRequests.some(url => url.includes("/assets/fonts/"))) {
    issues.push(`${record.engine}/${record.mode}: no local font asset was requested.`);
  }
  if (record.fontRequests.some(url => /fonts\.(?:googleapis|gstatic)\.com/.test(url))) {
    issues.push(`${record.engine}/${record.mode}: requested an external Google font.`);
  }
  for (const row of [...record.homeFontProof, ...record.summaryFontProof]) {
    if (!row.faces.some(face => face.family === "Rubik" && face.status === "loaded")) {
      issues.push(`${record.engine}/${record.mode}: Rubik did not load for ${row.selector}.`);
    }
  }
  if (!record.weights.rubik.every((row, index, array) => index === 0 || row.alphaMass > array[index - 1].alphaMass)) {
    issues.push(`${record.engine}/${record.mode}: Rubik raster mass is not increasing from 400 to 900.`);
  }
  if (record.summary.some(row => row.rasterFlags.documentWidth > row.width)) {
    issues.push(`${record.engine}/${record.mode}: horizontal overflow in the summary.`);
  }
}
for (const mode of ["normal", "external-fonts-blocked"]) {
  const chrome = records.find(row => row.engine === "chromium" && row.mode === mode && !row.failure);
  const safari = records.find(row => row.engine === "webkit" && row.mode === mode && !row.failure);
  if (!chrome || !safari) continue;
  if (JSON.stringify(chrome.home.copy.map(row => row.lines)) !== JSON.stringify(safari.home.copy.map(row => row.lines))) {
    issues.push(`${mode}: home word lines differ between Chromium and WebKit.`);
  }
  for (const [index, width] of [360, 375, 390, 430].entries()) {
    if (JSON.stringify(chrome.summary[index].copy.map(row => row.lines)) !==
        JSON.stringify(safari.summary[index].copy.map(row => row.lines))) {
      issues.push(`${mode}: summary word lines differ at ${width}px between Chromium and WebKit.`);
    }
  }
}
for (const engine of ["chromium", "webkit"]) {
  const normal = records.find(row => row.engine === engine && row.mode === "normal" && !row.failure);
  const blocked = records.find(row => row.engine === engine && row.mode === "external-fonts-blocked" && !row.failure);
  if (!normal || !blocked) continue;
  if (JSON.stringify(normal.home.copy.map(row => row.lines)) !== JSON.stringify(blocked.home.copy.map(row => row.lines)) ||
      JSON.stringify(normal.summary.map(row => row.copy.map(copy => copy.lines))) !==
      JSON.stringify(blocked.summary.map(row => row.copy.map(copy => copy.lines)))) {
    issues.push(`${engine}: blocking external fonts changed locally served copy wrapping.`);
  }
}

const sourceAssetProof = [];
for (const file of [
  "index.html", "assets/fonts/local.css", "assets/fonts/rubik-hebrew-v31.woff2",
  "assets/fonts/rubik-latin-v31.woff2", "assets/fonts/inter-latin-v20.woff2",
  "src/publicCircleDesignLayer.mjs", "src/publicDynamicTypeLayer.mjs",
  "src/publicLedgerWorkspaceLayer.mjs", "e2e/mobile-layout.spec.mjs"
]) {
  const bytes = await readFile(join(appRoot, file));
  sourceAssetProof.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
}
const result = {
  candidateCommit, candidateTree,
  instrumentationCommit: process.env.GITHUB_SHA || null,
  runId: process.env.GITHUB_RUN_ID || null,
  checkedAt: new Date().toISOString(),
  platform: os.platform(), osRelease: os.release(),
  scope: "Exact combined web source on macOS Chromium/WebKit with synthetic state; no CSS or Dynamic Type override, no native package or iPhone",
  fixtureSha256: sha256(Buffer.from(JSON.stringify(seededState))),
  sourceAssetProof, fontFiles, records, issues
};
await writeFile(join(output, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`FONT_PARITY_SUMMARY ${JSON.stringify({
  candidateCommit, candidateTree, instrumentationCommit: result.instrumentationCommit,
  runId: result.runId, records: records.length, issues
})}`);
if (issues.length) process.exitCode = 1;

async function readWeightControl(context, engine, mode) {
  const page = await context.newPage();
  const html = `<!doctype html><html lang="he" dir="rtl"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/assets/fonts/local.css">
    <style>body{margin:0;padding:20px;background:white;color:#111;font-family:Rubik,sans-serif}
    .weight{font-size:32px;line-height:1.4;margin:12px 0}</style></head><body>
    ${[400, 500, 700, 900].map(weight =>
      `<div class="weight" data-weight="${weight}" style="font-weight:${weight}">משקל ${weight} — אפשר לראות את המצב כרגע</div>`
    ).join("")}</body></html>`;
  await page.route("**/__font-control", route => route.fulfill({ contentType: "text/html", body: html }));
  try {
    await page.goto(`${origin}/__font-control`);
    await page.evaluate(async () => {
      for (const weight of [400, 500, 700, 900]) {
        await document.fonts.load(`${weight} 32px Rubik`, "אפשר לראות את המצב כרגע");
      }
      await document.fonts.load("900 32px Inter", "123.45");
      await document.fonts.ready;
    });
    const weight = await page.evaluate(() => ({
      rubik: [...document.querySelectorAll(".weight")].map(element => {
        const value = Number(element.dataset.weight);
        const canvas = document.createElement("canvas");
        canvas.width = 800; canvas.height = 70;
        const ctx = canvas.getContext("2d");
        ctx.font = `${value} 32px Rubik`;
        ctx.fillText("אפשר לראות את המצב כרגע", 0, 45);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let alphaMass = 0;
        for (let index = 3; index < pixels.length; index += 4) alphaMass += pixels[index];
        return { weight: value, computedWeight: getComputedStyle(element).fontWeight,
          width: ctx.measureText("אפשר לראות את המצב כרגע").width, alphaMass };
      }),
      loadedFaces: [...document.fonts].filter(face => face.status === "loaded")
        .map(face => ({ family: face.family, weight: face.weight, range: face.unicodeRange }))
    }));
    if (!weight.loadedFaces.some(face => face.family === "Rubik") ||
        !weight.loadedFaces.some(face => face.family === "Inter")) {
      throw new Error("Local Rubik and Inter faces must both load in the weight control.");
    }
    weight.screenshot = await capture(page, `${engine}-${mode}-rubik-weight-control.png`);
    return weight;
  } finally {
    await page.close();
  }
}

async function loadExactRubik(page, selectors) {
  return page.evaluate(async targetSelectors => {
    const rows = [];
    for (const selector of targetSelectors) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing copy: ${selector}`);
      const style = getComputedStyle(element);
      const text = element.textContent.trim();
      const descriptor = `${style.fontWeight} ${style.fontSize} Rubik`;
      const faces = await document.fonts.load(descriptor, text);
      rows.push({ selector, text, descriptor, faces: faces.map(face => ({
        family: face.family, weight: face.weight, status: face.status, range: face.unicodeRange
      })) });
    }
    await document.fonts.ready;
    return rows;
  }, selectors);
}

async function readWordLines(page, selectors) {
  return page.evaluate(targetSelectors => targetSelectors.map(selector => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing copy: ${selector}`);
    const style = getComputedStyle(element);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const lines = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (const match of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getClientRects()[0];
        if (!rect || rect.height < 1) continue;
        let line = lines.find(entry => Math.abs(entry.top - rect.top) <= 6);
        if (!line) { line = { top: rect.top, words: [] }; lines.push(line); }
        line.words.push(match[0]);
      }
    }
    return { selector, text: element.textContent.trim(),
      width: element.getBoundingClientRect().width, fontFamily: style.fontFamily,
      fontWeight: style.fontWeight, fontSize: style.fontSize,
      lineHeight: style.lineHeight, textWrap: style.textWrap,
      lines: lines.sort((a, b) => a.top - b.top).map(line => line.words.join(" ")) };
  }), selectors);
}

async function readRasterFlags(page) {
  return page.evaluate(() => ({
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    appleDynamicTypeSupported: CSS.supports("font", "-apple-system-body"),
    coarsePointer: matchMedia("(any-pointer: coarse)").matches,
    textSizeAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
    htmlClasses: document.documentElement.className,
    viewport: { innerWidth, innerHeight, dpr: devicePixelRatio },
    documentWidth: document.documentElement.scrollWidth
  }));
}

async function capture(page, name) {
  const bytes = await page.screenshot({ path: join(output, name), animations: "disabled" });
  return { name, bytes: bytes.length, sha256: sha256(bytes) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
