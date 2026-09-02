import { expect, test } from "@playwright/test";

const OWNER_ID = "person-legacy-platform-owner";

test("the app boots when iOS 15.0-era built-ins are unavailable", async ({ page, request }) => {
  const accountState = {
    currentParticipantId: OWNER_ID,
    participants: [{
      id: OWNER_ID,
      displayName: "ירין יצחק",
      kind: "user",
      avatarPreset: "avatar-1"
    }],
    friendContacts: [],
    groups: [],
    events: [],
    deletedEvents: [],
    deletedParticipants: []
  };
  await request.post("/api/reset");
  await request.put("/api/state", { data: accountState });
  await page.addInitScript(({ participantId, state }) => {
    delete Object.hasOwn;
    delete Array.prototype.at;
    delete globalThis.structuredClone;
    delete HTMLElement.prototype.inert;
    const nativeCssSupports = CSS.supports.bind(CSS);
    CSS.supports = (condition, value) => condition === "selector(:has(*))"
      ? false
      : nativeCssSupports(condition, value);
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

  const runtimeIssues = [];
  page.on("pageerror", (error) => runtimeIssues.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
  await expect(page.locator("#app-splash")).toHaveCount(0, { timeout: 8_000 });
  await expect.poll(() => page.evaluate(() => ({
    objectHasOwn: typeof Object.hasOwn,
    arrayAt: typeof Array.prototype.at,
    structuredClone: typeof globalThis.structuredClone,
    inert: "inert" in HTMLElement.prototype
  }))).toEqual({
    objectHasOwn: "function",
    arrayAt: "function",
    structuredClone: "function",
    inert: true
  });
  const inertFallback = await page.evaluate(async () => {
    const container = document.createElement("div");
    const button = document.createElement("button");
    let clicks = 0;
    button.addEventListener("click", () => {
      clicks += 1;
    });
    container.append(button);
    document.body.append(container);
    container.inert = true;
    button.click();
    const blocked = {
      inertAttribute: container.hasAttribute("inert"),
      ariaHidden: container.getAttribute("aria-hidden"),
      clicks
    };
    container.inert = false;
    button.click();
    const restored = {
      inertAttribute: container.hasAttribute("inert"),
      ariaHidden: container.getAttribute("aria-hidden"),
      clicks
    };
    const directAttributeContainer = document.createElement("div");
    directAttributeContainer.setAttribute("aria-hidden", "false");
    document.body.append(directAttributeContainer);
    directAttributeContainer.setAttribute("inert", "");
    await Promise.resolve();
    const directAttributeHidden = directAttributeContainer.getAttribute("aria-hidden");
    directAttributeContainer.removeAttribute("inert");
    await Promise.resolve();
    const directAttributeRestored = directAttributeContainer.getAttribute("aria-hidden");
    container.remove();
    directAttributeContainer.remove();
    return {
      blocked,
      restored,
      directAttributeHidden,
      directAttributeRestored
    };
  });
  expect(inertFallback).toEqual({
    blocked: { inertAttribute: true, ariaHidden: "true", clicks: 0 },
    restored: { inertAttribute: false, ariaHidden: null, clicks: 1 },
    directAttributeHidden: "true",
    directAttributeRestored: "false"
  });
  const cssHasFallback = await page.evaluate(async () => {
    const screen = document.createElement("section");
    screen.className = "screen";
    screen.dataset.productScreen = "new-event";
    screen.innerHTML = `
      <header class="product-app-identity"><nav class="product-app-nav"></nav></header>
      <div class="event-participant-route-backdrop"></div>
      <div class="expense-day-group"><div class="expense-row"><details class="expense-row-actions-menu" open></details></div></div>
      <label class="participant-pill is-account"><input type="checkbox" checked></label>
    `;
    document.querySelector("#app").append(screen);
    await Promise.resolve();
    await Promise.resolve();
    const result = {
      rootFallback: document.documentElement.classList.contains("sogrim-css-has-fallback"),
      bodyParticipantRoute: document.body.classList.contains("sogrim-has-event-participant-route"),
      bodyNewEvent: document.body.classList.contains("sogrim-has-new-or-join-screen"),
      screenParticipantRoute: screen.classList.contains("sogrim-has-event-participant-route"),
      expenseMenu: screen.querySelector(".expense-row").classList.contains("sogrim-has-open-expense-menu"),
      participantChecked: screen.querySelector(".participant-pill").classList.contains("sogrim-has-checked-input")
    };
    screen.remove();
    return result;
  });
  expect(cssHasFallback).toEqual({
    rootFallback: true,
    bodyParticipantRoute: true,
    bodyNewEvent: true,
    screenParticipantRoute: true,
    expenseMenu: true,
    participantChecked: true
  });
  expect(runtimeIssues).toEqual([]);
});
