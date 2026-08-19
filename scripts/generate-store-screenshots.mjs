import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createQrSvg } from "../src/domain/qrCode.mjs";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "docs", "store-assets");
const qaDir = resolve(root, ".qa-store-assets");
const port = 4207 + Math.floor(Math.random() * 400);
const baseURL = `http://127.0.0.1:${port}`;

const ownerId = "person-store-owner";
const guestId = "person-store-guest";
const eventId = "event-store-preview";
const ownerName = "\u05d9\u05e8\u05d9\u05df \u05d9\u05e6\u05d7\u05e7";
const guestName = "\u05de\u05d0\u05d5\u05e8 \u05e1\u05d9\u05d1\u05d5\u05e0\u05d9";

const seededState = {
  currentParticipantId: ownerId,
  participants: [
    { id: ownerId, displayName: ownerName, kind: "user", avatarPreset: "avatar-1" },
    { id: guestId, displayName: guestName, kind: "guest" }
  ],
  friendContacts: [],
  groups: [],
  events: [
    {
      id: eventId,
      name: "\u05d0\u05e8\u05d5\u05d7\u05ea \u05e2\u05e8\u05d1",
      eventType: "standard",
      currency: "ILS",
      participantIds: [ownerId, guestId],
      adminIds: [ownerId],
      createdByParticipantId: ownerId,
      createdAt: "2026-08-03T17:00:00.000Z",
      updatedAt: "2026-08-03T18:30:00.000Z",
      statusUpdatedAt: "2026-08-03T18:30:00.000Z",
      roundSettlementTransfers: true,
      expenses: [],
      transfers: [],
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

const sourceShots = [
  { name: "ui-event-type-current.png", prepare: openEventType },
  { name: "ui-expense-amount-current.png", prepare: openExpenseAmount },
  { name: "ui-invite-current.png", prepare: openInvite, finalize: finalizeInvite }
];

const marketingShots = [
  { slide: "event", apple: "apple-screenshot-01-event-1320x2868.png", google: "google-screenshot-01-event.png" },
  { slide: "expense", apple: "apple-screenshot-02-expense-1320x2868.png", google: "google-screenshot-02-expense.png" },
  { slide: "invite", apple: "apple-screenshot-03-invite-1320x2868.png", google: "google-screenshot-03-invite.png" }
];

await mkdir(qaDir, { recursive: true });
const server = spawn(process.execPath, ["server.mjs", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    APP_LOCAL_STATE_FILE: ".qa-store-assets/app-state.json",
    APP_PUBLIC_URL: "https://sogrim-hesbon-app.vercel.app",
    SUPABASE_URL: " ",
    SUPABASE_ANON_KEY: " ",
    SUPABASE_SERVICE_ROLE_KEY: " ",
    SUPABASE_SECRET_KEY: " ",
    GOOGLE_CLIENT_ID: " ",
    VERCEL: "",
    VERCEL_ENV: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

let browser;
try {
  await waitForServer();
  await putState();
  browser = await chromium.launch({ headless: true });
  await captureProductScreens(browser);
  await captureMarketingScreens(browser);
  await verifyOutputs();
  console.log("Store screenshots generated and verified.");
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolvePromise) => server.once("exit", resolvePromise));
    server.kill();
    await Promise.race([
      stopped,
      new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000))
    ]);
  }
  await rm(qaDir, { recursive: true, force: true });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error("Timed out waiting for the screenshot server");
}

async function putState() {
  const response = await fetch(`${baseURL}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(seededState)
  });
  if (!response.ok) throw new Error(`Unable to seed screenshot state (${response.status})`);
}

async function captureProductScreens(browserInstance) {
  const context = await browserInstance.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce"
  });

  await context.addInitScript(({ state, participantId, displayName }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({ participantId, displayName, avatarPreset: "avatar-1" })
    );
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state: seededState, participantId: ownerId, displayName: ownerName });

  const page = await context.newPage();
  for (const shot of sourceShots) {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.locator('#app .screen[data-screen-kind="home"]').waitFor({ state: "visible" });
    await shot.prepare(page);
    await settleVisuals(page);
    await shot.finalize?.(page);
    await page.screenshot({
      path: resolve(outputDir, shot.name),
      fullPage: false,
      animations: "disabled"
    });
  }
  await context.close();
}

async function openEventType(page) {
  await page.locator('[data-action="new-event"]').first().click();
  await page.locator('[data-event-creation-step="type"]').waitFor({ state: "visible" });
}

async function openExpenseAmount(page) {
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator(`[data-screen-kind="event"][data-event-id="${eventId}"]`).waitFor({ state: "visible" });
  await page.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first().click();
  const dialog = page.locator('.expense-step-modal[data-expense-step="amount"]');
  await dialog.waitFor({ state: "visible" });
  await page.locator('[data-action="expense-total"]').fill("120");
}

async function openInvite(page) {
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator(`[data-screen-kind="event"][data-event-id="${eventId}"]`).waitFor({ state: "visible" });
  await page.locator(`[data-action="open-event-share"][data-event-id="${eventId}"]`).first().click();
  await page.locator('.event-modal[role="dialog"] [data-share-ready="true"]').waitFor({ state: "attached" });
  await page.waitForTimeout(500);
}

async function finalizeInvite(page) {
  const inviteUrl = `https://sogrim-hesbon-app.vercel.app/?event=${eventId}&t=0123456789abcdef0123456789abcdef`;
  const qrMarkup = createQrSvg(inviteUrl, { cellSize: 3, quietZone: 4 });
  const dialog = page.locator('.event-modal[role="dialog"]:visible').last();
  await dialog.evaluate((activeDialog, { url, markup }) => {
    activeDialog
      .querySelectorAll('[data-action="copy-invite"]')
      .forEach((button) => button.removeAttribute("data-action"));
    const input = activeDialog.querySelector('input[name="eventInviteUrl"]');
    if (input) input.value = url;
    const qr = activeDialog.querySelector('[data-public-invite-qr]');
    const qrCode = qr?.querySelector('.public-invite-qr-code');
    if (qr) qr.dataset.inviteUrl = url;
    if (qrCode) qrCode.innerHTML = markup;
  }, { url: inviteUrl, markup: qrMarkup });
  await page.waitForTimeout(80);
}

async function settleVisuals(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.images) {
      if (!image.complete) await image.decode().catch(() => {});
    }
  });
  await page.waitForTimeout(120);
}

async function captureMarketingScreens(browserInstance) {
  for (const shot of marketingShots) {
    await captureMarketingScreen(browserInstance, shot.slide, shot.apple, 1320, 2868);
    await captureMarketingScreen(browserInstance, shot.slide, shot.google, 1080, 1920);
  }
}

async function captureMarketingScreen(browserInstance, slide, filename, width, height) {
  const context = await browserInstance.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: "he-IL",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/docs/store-assets/store-screenshot-source.html?slide=${slide}`, {
    waitUntil: "networkidle"
  });
  await page.waitForFunction(() => {
    const image = document.querySelector("#screen");
    return image?.complete && image.naturalWidth >= 1000;
  });
  await settleVisuals(page);
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(80);
  const geometry = await page.evaluate(() => ({
    scrollY: window.scrollY,
    pageTop: document.querySelector(".page")?.getBoundingClientRect().top,
    brandTop: document.querySelector(".brand")?.getBoundingClientRect().top,
    brandBottom: document.querySelector(".brand")?.getBoundingClientRect().bottom,
    titleTop: document.querySelector("h1")?.getBoundingClientRect().top
  }));
  if (
    Math.abs(geometry.scrollY) > 1 ||
    Math.abs(geometry.pageTop ?? 0) > 1 ||
    (geometry.brandTop ?? -1) < 0 ||
    (geometry.titleTop ?? -1) < (geometry.brandBottom ?? 0)
  ) {
    throw new Error(`Marketing screenshot moved off-canvas: ${JSON.stringify(geometry)}`);
  }
  const cdp = await context.newCDPSession(page);
  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(resolve(outputDir, filename), Buffer.from(capture.data, "base64"));
  await context.close();
}

async function verifyOutputs() {
  const expected = [
    ...sourceShots.map(({ name }) => ({ name, width: 1290, height: 2796 })),
    ...marketingShots.flatMap(({ apple, google }) => [
      { name: apple, width: 1320, height: 2868 },
      { name: google, width: 1080, height: 1920 }
    ])
  ];

  for (const item of expected) {
    const buffer = await readFile(resolve(outputDir, item.name));
    const signature = buffer.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") throw new Error(`${item.name} is not a PNG file`);
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width !== item.width || height !== item.height) {
      throw new Error(`${item.name} is ${width}x${height}; expected ${item.width}x${item.height}`);
    }
  }
}
