import { expect, test } from "@playwright/test";

const participantId = "person-offline-fonts";
const seededState = {
  currentParticipantId: participantId,
  participants: [{ id: participantId, displayName: "ירין יצחק", kind: "user" }],
  friendContacts: [], groups: [], events: [], deletedEvents: [], deletedParticipants: []
};

test.use({ serviceWorkers: "block" });

test("Hebrew and numeric brand fonts load when Google Fonts is unreachable", async ({ page, request }) => {
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await request.post("/api/reset");
  await request.put("/api/state", { data: seededState });
  await page.addInitScript(({ state, participantId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId, displayName: "ירין יצחק"
    }));
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state: seededState, participantId });

  await page.goto("/");
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.load('600 24px Rubik', 'מה סוגרים היום?');
    await document.fonts.load('600 24px Inter', '2026');
    await document.fonts.ready;
    return {
      loadedFamilies: [...new Set([...document.fonts]
        .filter(face => face.status === "loaded")
        // FontFace.family is a CSS descriptor: Firefox preserves the quotes
        // around the single family name. Compare the same semantic name in
        // all engines without relaxing the loaded-face/resource checks.
        .map(face => face.family.replace(/^(["'])(.*)\1$/, "$2")))],
      localResources: performance.getEntriesByType("resource")
        .filter(entry => /\/fonts\/.*\.woff2/.test(entry.name))
        .map(entry => entry.name),
      homeTitleFamily: getComputedStyle(document.querySelector('.product-home-screen .top .brand h1')).fontFamily
    };
  });

  expect(fonts.homeTitleFamily).toContain("Rubik");
  expect(fonts.loadedFamilies).toContain("Rubik");
  expect(fonts.loadedFamilies).toContain("Inter");
  expect(fonts.localResources.length, "font data must come from this app's local assets")
    .toBeGreaterThanOrEqual(2);
});
