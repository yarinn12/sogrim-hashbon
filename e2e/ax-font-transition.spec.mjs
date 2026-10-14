import { expect, test } from "@playwright/test";
import { openHeldRenderedHome, requireHeldHomeReadiness } from "./helpers/heldHomeReadinessControl.mjs";

requireHeldHomeReadiness(test);

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

test("large and normal text take effect immediately with reduced motion", async ({ page, request }) => {
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

  await openHeldRenderedHome(page);
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
    // 16px root and 14px compact description after the preference changes.
    const enlarged = {
      viewport: { width: innerWidth, height: innerHeight },
      reducedMotion,
      coarsePointer,
      finePointer: matchMedia("(any-pointer: fine)").matches,
      beforeRoot,
      beforeDescription,
      root: parseFloat(getComputedStyle(root).fontSize),
      description: parseFloat(getComputedStyle(description).fontSize),
      rootFontTransition: root.getAnimations().some(animation =>
        animation instanceof CSSTransition && animation.transitionProperty === "font-size"),
      descriptionFontTransition: description.getAnimations().some(animation =>
        animation instanceof CSSTransition && animation.transitionProperty === "font-size")
    };

    root.classList.remove("dynamic-type-active", "dynamic-type-apple", "dynamic-type-extra-large");
    root.style.removeProperty("--apple-font-scale");
    root.style.removeProperty("font-size");
    return {
      ...enlarged,
      restoredRoot: parseFloat(getComputedStyle(root).fontSize),
      restoredDescription: parseFloat(getComputedStyle(description).fontSize),
      restoredRootFontTransition: root.getAnimations().some(animation =>
        animation instanceof CSSTransition && animation.transitionProperty === "font-size"),
      restoredDescriptionFontTransition: description.getAnimations().some(animation =>
        animation instanceof CSSTransition && animation.transitionProperty === "font-size")
    };
  });

  expect(sizes.reducedMotion).toBe(true);
  expect(sizes.viewport).toEqual({ width: 375, height: 667 });
  expect(sizes.coarsePointer).toBe(false);
  expect(sizes.finePointer).toBe(true);
  expect(sizes.beforeRoot).toBeCloseTo(16, 3);
  expect(sizes.beforeDescription).toBeCloseTo(14, 3);
  expect(sizes.root).toBeCloseTo(37.64706, 3);
  expect(sizes.description).toBeCloseTo(32.941176, 3);
  expect(sizes.rootFontTransition).toBe(false);
  expect(sizes.descriptionFontTransition).toBe(false);
  expect(sizes.restoredRoot).toBeCloseTo(16, 3);
  expect(sizes.restoredDescription).toBeCloseTo(14, 3);
  expect(sizes.restoredRootFontTransition).toBe(false);
  expect(sizes.restoredDescriptionFontTransition).toBe(false);

  await openHeldRenderedHome(page, { path: "/?dynamic-type-preview=28" });
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible();
  const previewReturn = await page.evaluate(() => {
    const root = document.documentElement;
    const description = document.querySelector(".product-home-screen .top .brand .muted");
    const beforeRoot = parseFloat(getComputedStyle(root).fontSize);
    const beforeDescription = parseFloat(getComputedStyle(description).fontSize);
    root.classList.remove("dynamic-type-preview");
    root.style.removeProperty("font-size");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      coarsePointer: matchMedia("(any-pointer: coarse)").matches,
      finePointer: matchMedia("(any-pointer: fine)").matches,
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
  expect(previewReturn.beforeRoot).toBeCloseTo(28, 3);
  expect(previewReturn.viewport).toEqual({ width: 375, height: 667 });
  expect(previewReturn.coarsePointer).toBe(false);
  expect(previewReturn.finePointer).toBe(true);
  expect(previewReturn.beforeDescription).toBeCloseTo(24.5, 3);
  expect(previewReturn.root).toBeCloseTo(16, 3);
  expect(previewReturn.description).toBeCloseTo(14, 3);
  expect(previewReturn.rootFontTransition).toBe(false);
  expect(previewReturn.descriptionFontTransition).toBe(false);
});
