import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", reducedMotion: "no-preference" });
const errors = new WeakMap();
test.beforeEach(async ({ page, request }) => {
  const owner = "person-profile-race";
  const state = { currentParticipantId: owner,
    participants: [{ id: owner, displayName: "בדיקת פרופיל", kind: "user", avatarPreset: "avatar-1" }],
    friendContacts: [], groups: [], events: [], deletedEvents: [], deletedParticipants: [] };
  await request.post("/api/reset"); await request.put("/api/state", { data: state });
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", owner);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({ participantId: owner, displayName: "בדיקת פרופיל", avatarPreset: "avatar-1" }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    window.__profileCaretTrace = [];
    for (const method of ["focus", "select", "setSelectionRange"]) {
      const original = HTMLInputElement.prototype[method];
      HTMLInputElement.prototype[method] = function (...args) {
        if (this.dataset.action === "profile-name") {
          window.__profileCaretTrace.push({ method, args, value: this.value, start: this.selectionStart, end: this.selectionEnd, stack: new Error().stack });
        }
        return original.apply(this, args);
      };
    }
  }, { state, owner });
  // Only the synthetic local response exposes these diagnostics; production
  // modules contain neither this API nor synthetic account write behavior.
  await page.route("**/src/app.mjs*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
      window.__profileSaveQA = {
        hold() { this.pending = []; globalThis.SogrimAccountProfile = { updateProfile: () => new Promise(resolve => this.pending.push(resolve)) }; },
        release(index, value) { this.pending[index](value); },
        snapshot() { return { notice, screen: screen.name, profile: localProfile, revision: profileAvatarRevision }; }
      };` });
  });
  const pageErrors = []; errors.set(page, pageErrors);
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator('[data-nav-destination="profile"]').click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  expect(await page.locator("body").innerText()).not.toBe("");
  await expect(page.locator('[data-nextjs-dialog], .vite-error-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__profileSaveQA.hold());
});
test.afterEach(async ({ page }) => { expect(errors.get(page) ?? []).toEqual([]); });

async function selectAvatar(page, value) {
  const picker = page.locator(".profile-avatar-picker-shell");
  if (await picker.getAttribute("open") === null) await picker.locator(":scope > summary").click();
  // The visible label/preview is the real tap target; the styled radio itself
  // is covered by that preview and is not meant to receive pointer hits.
  await picker.locator(`label.profile-avatar-option:has([value="${value}"])`).click();
}

test("old avatar success does not erase the latest pending-sync feedback", async ({ page }, testInfo) => {
  await selectAvatar(page, "avatar-2");
  await expect.poll(() => page.evaluate(() => window.__profileSaveQA.pending.length)).toBe(1);
  await selectAvatar(page, "avatar-3");
  await expect.poll(() => page.evaluate(() => window.__profileSaveQA.pending.length)).toBe(2);
  await page.evaluate(() => window.__profileSaveQA.release(1, false));
  await expect(page.locator(".notice")).toContainText("השלמת הסנכרון");
  await page.evaluate(() => window.__profileSaveQA.release(0, true));
  await page.waitForTimeout(150);
  await expect(page.locator(".notice")).toContainText("השלמת הסנכרון");
  expect(await page.evaluate(() => window.__profileSaveQA.snapshot().profile.avatarPreset)).toBe("avatar-3");
  await page.screenshot({ path: testInfo.outputPath("latest-avatar-pending.png"), fullPage: true });
});

test("avatar completion preserves a newly focused name field and typing", async ({ page }, testInfo) => {
  await selectAvatar(page, "avatar-2");
  await expect.poll(() => page.evaluate(() => window.__profileSaveQA.pending.length)).toBe(1);
  await page.locator('[data-action="edit-profile-name"]').click();
  const field = page.locator('[data-action="profile-name"]');
  await field.fill("טיוטה חדשה");
  const before = await page.evaluate(() => {
    const element = document.querySelector('[data-action="profile-name"]');
    const selection = { start: element.selectionStart, end: element.selectionEnd, value: element.value };
    window.__profileSaveQA.release(0, true);
    return selection;
  });
  await page.waitForTimeout(150);
  const after = await field.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd, value: element.value }));
  const trace = await page.evaluate(() => window.__profileCaretTrace);
  await testInfo.attach("caret-before-after", { body: JSON.stringify({ before, after, trace }), contentType: "application/json" });
  await expect(field).toBeFocused();
  expect(after).toEqual(before);
  await page.keyboard.insertText(" נשמרת");
  await expect(field).toHaveValue("טיוטה חדשה נשמרת");
});

test("avatar completion cannot navigate back or add stale feedback after leaving profile", async ({ page }, testInfo) => {
  await selectAvatar(page, "avatar-2");
  await expect.poll(() => page.evaluate(() => window.__profileSaveQA.pending.length)).toBe(1);
  await page.locator('[data-nav-destination="home"]').click();
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  const before = await page.evaluate(() => window.__profileSaveQA.snapshot().notice);
  await page.evaluate(() => window.__profileSaveQA.release(0, false));
  await page.waitForTimeout(150);
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  expect(await page.evaluate(() => window.__profileSaveQA.snapshot().notice)).toBe(before);
  await page.screenshot({ path: testInfo.outputPath("home-after-avatar-save.png") });
});
