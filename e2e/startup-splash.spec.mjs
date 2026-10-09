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

  test("keeps a branded frame over the video until its first playable frame", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const samples = [];
    for (let index = 0; index < 20; index += 1) {
      const sample = await page.evaluate(() => {
        const node = document.querySelector("#app-splash");
        if (!node?.isConnected) return null;
        const video = node.querySelector(".app-splash-video");
        const fallback = node.querySelector(".app-splash-hold");
        const result = {
          ready: node.classList.contains("is-video-ready"),
          videoOpacity: video ? getComputedStyle(video).opacity : "missing",
          fallbackOpacity: fallback ? getComputedStyle(fallback).opacity : "missing",
          autoplay: video?.autoplay ?? false,
          poster: video?.getAttribute("poster") ?? ""
        };
        return node.isConnected ? result : null;
      });
      if (!sample) break;
      samples.push(sample);
      await page.waitForTimeout(25);
    }

    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.autoplay).toBe(true);
      expect(sample.poster).toBe("./assets/sogrim-logo-intro-hold.jpg");
      if (sample.ready) {
        expect(sample.videoOpacity).toBe("1");
        expect(sample.fallbackOpacity).toBe("0");
      } else {
        expect(sample.videoOpacity).toBe("0");
        expect(sample.fallbackOpacity).toBe("1");
      }
    }
  });

  test("falls back cleanly when the intro video cannot load", async ({ page }, testInfo) => {
    let documentVideoBlocked = false;
    const blockedVideoSource = "data:video/mp4;base64,AA==";
    // WebKit can play the MP4 without passing its media request through page.route.
    // Replace the document source so this test always exercises a failed video.
    await page.route(new URL("/", testInfo.project.use.baseURL).href, async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      const originalSource = 'src="./assets/sogrim-heshbon-loading-loop-v2.mp4"';
      documentVideoBlocked = html.includes(originalSource);
      await route.fulfill({ response, body: html.replace(originalSource, `src="${blockedVideoSource}"`) });
    });
    await page.addInitScript(() => {
      const probe = { source: "", fallbackSeen: false, videoReadySeen: false, errorCode: null };
      window.__qaSplashFailureProbe = probe;
      const inspect = () => {
        const splash = document.querySelector("#app-splash");
        if (!splash) return;
        const video = splash.querySelector(".app-splash-video");
        if (video) {
          probe.source = video.getAttribute("src") || "";
          probe.errorCode = video.error?.code ?? probe.errorCode;
        }
        probe.fallbackSeen ||= splash.classList.contains("is-fallback");
        probe.videoReadySeen ||= splash.classList.contains("is-video-ready");
      };
      new MutationObserver(inspect).observe(document, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["class", "src"]
      });
      document.addEventListener("error", (event) => {
        if (event.target?.classList?.contains("app-splash-video")) {
          probe.errorCode = event.target.error?.code ?? probe.errorCode;
        }
      }, true);
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(documentVideoBlocked).toBe(true);
    expect(await page.evaluate(() => window.__qaSplashFailureProbe.source)).toBe(blockedVideoSource);

    await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
    expect(await startupMarkTime(page, "first-screen-rendered")).toBeLessThan(
      CONTENT_RENDER_BUDGET_MS
    );
    await expect.poll(() => page.evaluate(() => window.__qaSplashFailureProbe.fallbackSeen)).toBe(true);
    expect(await page.evaluate(() => window.__qaSplashFailureProbe.videoReadySeen)).toBe(false);
    expect(await page.evaluate(() => window.__qaSplashFailureProbe.errorCode)).not.toBeNull();
    await expect(page.locator("#app-splash")).toHaveCount(0, { timeout: 8_000 });
    expect(await startupMarkTime(page, "splash-dismissed")).toBeLessThan(
      SPLASH_HARD_LIMIT_MS
    );
  });
});
