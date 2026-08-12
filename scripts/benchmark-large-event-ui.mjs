import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const port = Number(process.env.LARGE_EVENT_BENCHMARK_PORT || 4193);
const baseUrl = `http://127.0.0.1:${port}`;
const runCount = positiveInteger(process.env.LARGE_EVENT_BENCHMARK_RUNS, 1);
const expenseCount = positiveInteger(process.env.LARGE_EVENT_EXPENSES, 1_000);
const participantCount = positiveInteger(process.env.LARGE_EVENT_PARTICIPANTS, 50);
const reportPath = process.env.LARGE_EVENT_BENCHMARK_REPORT ||
  join(root, "artifacts", "performance", "large-event-ui.json");
const state = createState({ expenseCount, participantCount });
const server = spawn(process.execPath, ["server.mjs", String(port)], {
  cwd: root,
  env: {
    ...process.env,
    APP_LOCAL_STATE_FILE: ".qa-performance/app-state.json",
    APP_PUBLIC_URL: " ",
    SUPABASE_URL: " ",
    SUPABASE_ANON_KEY: " ",
    SUPABASE_SERVICE_ROLE_KEY: " ",
    SUPABASE_SECRET_KEY: " ",
    GOOGLE_CLIENT_ID: " ",
    VERCEL: "",
    VERCEL_ENV: ""
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let browser;
try {
  await waitForHealth(`${baseUrl}/api/health`);
  browser = await chromium.launch({ headless: true });
  const samples = [];
  for (let run = 1; run <= runCount; run += 1) {
    samples.push(await measureRun(browser, state, run));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runCount,
    expenseCount,
    participantCount,
    stateBytes: Buffer.byteLength(JSON.stringify(state)),
    startupMs: summarize(samples.map((sample) => sample.startupMs)),
    eventOpenMs: summarize(samples.map((sample) => sample.eventOpenMs)),
    eventSettledMs: summarize(samples.map((sample) => sample.eventSettledMs)),
    startupDomNodes: summarize(samples.map((sample) => sample.startupDomNodes)),
    eventDomNodes: summarize(samples.map((sample) => sample.eventDomNodes)),
    participantDomItems: summarize(samples.map((sample) => sample.participantDomItems)),
    participantDomItemsAfterExpand: summarize(
      samples.map((sample) => sample.participantDomItemsAfterExpand)
    ),
    expenseRows: summarize(samples.map((sample) => sample.expenseRows)),
    samples
  };

  await mkdir(join(root, "artifacts", "performance"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (
    samples.some((sample) =>
      sample.expenseRows !== expenseCount ||
      sample.participantDomItems !== 0 ||
      sample.participantDomItemsAfterExpand !== participantCount
    )
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  server.kill();
}

async function measureRun(browserInstance, seededState, run) {
  const context = await browserInstance.newContext({
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    viewport: { width: 393, height: 852 },
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.addInitScript(({ participantId, appState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(appState));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId,
        displayName: "משתמש ביצועים",
        avatarPreset: "avatar-1"
      })
    );
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, {
    participantId: seededState.currentParticipantId,
    appState: seededState
  });

  const startupStartedAt = performance.now();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="open-event"][data-event-id="event-benchmark"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });
  const startupMs = round(performance.now() - startupStartedAt);
  const startupDomNodes = await page.locator("*").count();

  const eventMeasurement = await page.evaluate(async () => {
    const trigger = document.querySelector(
      '[data-action="open-event"][data-event-id="event-benchmark"]'
    );
    if (!(trigger instanceof HTMLElement)) throw new Error("Benchmark event trigger missing");

    const startedAt = performance.now();
    trigger.click();
    const eventOpenMs = performance.now() - startedAt;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    return {
      eventOpenMs,
      eventSettledMs: performance.now() - startedAt,
      eventDomNodes: document.querySelectorAll("*").length,
      participantDomItems: document.querySelectorAll(".expense-participant-item").length,
      expenseRows: document.querySelectorAll(".expense-row").length
    };
  });

  await page.locator('[data-action="toggle-expense-participants"]').first().click();
  const participantDomItemsAfterExpand = await page
    .locator(".expense-participant-item")
    .count();

  await context.close();
  return {
    run,
    startupMs,
    startupDomNodes,
    eventOpenMs: round(eventMeasurement.eventOpenMs),
    eventSettledMs: round(eventMeasurement.eventSettledMs),
    eventDomNodes: eventMeasurement.eventDomNodes,
    participantDomItems: eventMeasurement.participantDomItems,
    participantDomItemsAfterExpand,
    expenseRows: eventMeasurement.expenseRows
  };
}

function createState({ expenseCount: expenses, participantCount: participants }) {
  const people = Array.from({ length: participants }, (_, index) => ({
    id: `person-${index + 1}`,
    displayName: `משתתף ${index + 1}`,
    kind: index < 5 ? "user" : "guest",
    avatarPreset: `avatar-${(index % 8) + 1}`
  }));
  const participantIds = people.map((person) => person.id);
  const expenseRows = Array.from({ length: expenses }, (_, index) => {
    const total = 1_000 + (index % 9_999);
    return {
      id: `expense-${index + 1}`,
      name: `הוצאה ${index + 1}`,
      total,
      payers: [{ participantId: participantIds[index % participantIds.length], amount: total }],
      sharedByParticipantIds: participantIds,
      createdByParticipantId: participantIds[index % participantIds.length],
      occurredOn: "2026-08-12",
      updatedAt: "2026-08-12T09:00:00.000Z"
    };
  });

  return {
    currentParticipantId: participantIds[0],
    participants: people,
    friendContacts: [],
    groups: [],
    events: [{
      id: "event-benchmark",
      name: "אירוע בדיקת ביצועים",
      eventType: "trip",
      currency: "ILS",
      participantIds,
      adminIds: [participantIds[0]],
      createdByParticipantId: participantIds[0],
      createdAt: "2026-08-12T08:00:00.000Z",
      updatedAt: "2026-08-12T09:00:00.000Z",
      expenses: expenseRows,
      transfers: [],
      activityLog: []
    }],
    deletedEvents: [],
    deletedParticipants: []
  };
}

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Performance server did not become ready at ${url}`);
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    max: sorted.at(-1) ?? 0,
    average: round(sorted.length ? sum / sorted.length : 0)
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
