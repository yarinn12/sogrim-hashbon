import { expect, test } from "@playwright/test";

const OWNER_ID = "person-home-responsive-owner";
const emptyAccountState = {
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

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: emptyAccountState });

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
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { participantId: OWNER_ID, state: emptyAccountState });
});

test("the empty home hero stays intact on iPhone and iPad", async ({ page }, testInfo) => {
  test.skip(
    !["iphone-webkit", "ipad-webkit"].includes(testInfo.project.name),
    "This regression targets iOS and iPadOS layouts"
  );

  const viewports = testInfo.project.name === "ipad-webkit"
    ? [
        { width: 768, height: 1024 },
        { width: 1194, height: 834 }
      ]
    : [{ width: 390, height: 844 }];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();

    const layout = await page.evaluate(() => {
      const screen = document.querySelector('#app .screen[data-screen-kind="home"]');
      const hero = screen?.querySelector(":scope > .top");
      const copy = hero?.querySelector(".brand");
      const action = screen?.querySelector('[data-action="new-event"]');
      const promo = screen?.querySelector(".home-empty-visual");
      const promoImage = promo?.querySelector("img");
      const brandImage = screen?.querySelector(".product-brand-image");
      const rect = (element) => {
        const bounds = element?.getBoundingClientRect();
        return bounds
          ? {
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
              width: bounds.width,
              height: bounds.height
            }
          : null;
      };

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        screen: rect(screen),
        hero: rect(hero),
        copy: rect(copy),
        action: rect(action),
        promo: rect(promo),
        promoImageFit: promoImage ? getComputedStyle(promoImage).objectFit : "",
        brandImageFit: brandImage ? getComputedStyle(brandImage).objectFit : "",
        brandImageTransform: brandImage ? getComputedStyle(brandImage).transform : ""
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.screen.left).toBeGreaterThanOrEqual(0);
    expect(layout.screen.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.hero.left).toBeGreaterThanOrEqual(0);
    expect(layout.hero.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.action.bottom).toBeLessThanOrEqual(layout.hero.bottom + 2);
    expect(layout.action.top - layout.copy.bottom).toBeGreaterThanOrEqual(12);
    expect(layout.promo.width / layout.promo.height).toBeCloseTo(1672 / 941, 2);
    expect(layout.promoImageFit).toBe("contain");
    expect(layout.brandImageFit).toBe("contain");
    expect(layout.brandImageTransform).toBe("none");

    if (viewport.width >= 721) {
      expect(layout.screen.width).toBeGreaterThanOrEqual(Math.min(viewport.width, 960) - 2);
    }
  }
});
