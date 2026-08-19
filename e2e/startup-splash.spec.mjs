import { expect, test } from "@playwright/test";

const OWNER_ID = "person-splash-owner";
const CONTENT_RENDER_BUDGET_MS = 2_500;
const SPLASH_HARD_LIMIT_MS = 6_500;

async function startupMarkTime(page, name) {
  return page.evaluate((markName) => {
    const entry = performance.getEntriesByName(`sogrim:start:${markName}`)[0];
    return entry?.startTime ?? Number.POSITIVE_INFINITY;
  }, name);
}

const accountState = {
  currentParticipantId: OWNER_ID,
  participants: [
    {
      id: OWNER_ID,
      displayName: "ירין יצחק",
      kind: "user",
      avatarPreset: "avatar-1"
    }
  ],
  friendContacts: [],
  groups: [],
  events: [],
  deletedEvents: [],
  deletedParticipants: []
};

test.describe("startup splash", () => {
  test.use({ reducedMotion: "no-preference" });

  test.beforeEach(async ({ page, request }) => {
    await request.post("/api/reset");
    await request.put("/api/state", { data: accountState });

    await page.addInitScript(({ participantId, state }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("settle-friends-state", JSON.stringify(state));
      localStorage.setItem(
        "settle-friends-local-profile",
        JSON.stringify({
          participantId,
          displayName: "ירין יצחק",
          avatarPreset: "avatar-1"
        })
      );
      localStorage.setItem("settle-friends-current-participant", participantId);
    }, { participantId: OWNER_ID, state: accountState });
  });

  test("reveals the real screen and removes the splash", async ({ page }) => {
    const runtimeIssues = [];
    page.on("pageerror", (error) => runtimeIssues.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource:")
      ) {
        runtimeIssues.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        !response.url().startsWith("https://fonts.gstatic.com/")
      ) {
        runtimeIssues.push(`response ${response.status()}: ${response.url()}`);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
    expect(await startupMarkTime(page, "first-screen-rendered")).toBeLessThan(
      CONTENT_RENDER_BUDGET_MS
    );
    await expect(page.locator("#app-splash")).toHaveCount(0, { timeout: 8_000 });
    expect(await startupMarkTime(page, "splash-dismissed")).toBeLessThan(
      SPLASH_HARD_LIMIT_MS
    );
    expect(runtimeIssues).toEqual([]);
  });

  test("falls back cleanly when the intro video cannot load", async ({ page }) => {
    await page.route("**/assets/sogrim-logo-intro.mp4", (route) => route.abort());
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
    expect(await startupMarkTime(page, "first-screen-rendered")).toBeLessThan(
      CONTENT_RENDER_BUDGET_MS
    );
    await expect(page.locator("#app-splash")).toHaveCount(0, { timeout: 8_000 });
    expect(await startupMarkTime(page, "splash-dismissed")).toBeLessThan(
      SPLASH_HARD_LIMIT_MS
    );
  });
});
