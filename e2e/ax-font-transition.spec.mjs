import { expect, test } from "@playwright/test";

const OWNER = "person-ax-font-transition";
const state = {
  currentParticipantId: OWNER,
  participants: [{
    id: OWNER,
    displayName: "בודק הגדלת טקסט",
    kind: "user",
    avatarPreset: "avatar-1"
  }],
  friendContacts: [],
  groups: [],
  deletedEvents: [],
  deletedParticipants: [],
  events: []
};

test.use({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false
});

test("large text takes effect immediately with reduced motion", async ({ page, request }) => {
  // The project device profile can override test.use media settings. Apply the
  // requested OS preference to this page before the app styles load.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ owner, initialState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(initialState));
    localStorage.setItem("settle-friends-current-participant", owner);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner,
      displayName: "בודק הגדלת טקסט",
      avatarPreset: "avatar-1"
    }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { owner: OWNER, initialState: state });

  await page.goto("/");
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
  const sizes = await page.evaluate(() => {
    const root = document.documentElement;
    const description = document.querySelector(".product-home-screen .top .brand .muted");
    if (!description) throw new Error("Home description is missing");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = matchMedia("(any-pointer: coarse)").matches;
    const beforeRoot = parseFloat(getComputedStyle(root).fontSize);
    const beforeDescription = parseFloat(getComputedStyle(description).fontSize);

    root.classList.add("dynamic-type-active", "dynamic-type-apple", "dynamic-type-extra-large");
    root.style.setProperty("--apple-font-scale", String(40 / 17));
    root.style.setProperty("font-size", "37.64706px", "important");

    // Read in the same browser task: a transition must not expose the old
    // 16px root and 13px description for a frame after the preference changes.
    return {
      reducedMotion,
      coarsePointer,
      beforeRoot,
      beforeDescription,
      root: parseFloat(getComputedStyle(root).fontSize),
      description: parseFloat(getComputedStyle(description).fontSize),
      rootFontTransition: root.getAnimations().some(animation =>
        animation instanceof CSSTransition && animation.transitionProperty === "font-size"),
      descriptionFontTransition: description.getAnimations().some(animation =>
        animation instanceof CSSTransition && animation.transitionProperty === "font-size")
    };
  });

  expect(sizes.reducedMotion).toBe(true);
  expect(sizes.coarsePointer).toBe(false);
  expect(sizes.beforeRoot).toBeCloseTo(16, 3);
  expect(sizes.beforeDescription).toBeCloseTo(13, 3);
  expect(sizes.root).toBeCloseTo(37.64706, 3);
  expect(sizes.description).toBeCloseTo(30.588236, 3);
  expect(sizes.rootFontTransition).toBe(false);
  expect(sizes.descriptionFontTransition).toBe(false);
});
