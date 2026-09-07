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

const populatedAccountState = {
  ...emptyAccountState,
  events: [
    {
      id: "event-home-responsive-existing",
      name: "אירוע קיים",
      eventType: "standard",
      currency: "ILS",
      participantIds: [OWNER_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-28T08:00:00.000Z",
      updatedAt: "2026-08-28T08:00:00.000Z",
      roundSettlementTransfers: true,
      directSettlementTransfers: false,
      locked: false,
      expenses: [],
      transfers: [],
      activityLog: []
    }
  ]
};

const newlyJoinedOldEvent = {
  id: "event-1720000000000-newly-joined",
  name: "אירוע ישן שהצטרפתי אליו עכשיו",
  eventType: "standard",
  currency: "ILS",
  participantIds: [OWNER_ID],
  adminIds: [],
  createdByParticipantId: "another-account",
  createdAt: "2024-07-03T08:00:00.000Z",
  updatedAt: "2024-07-03T08:00:00.000Z",
  membershipUpdatedAtByParticipant: {
    [OWNER_ID]: "2026-08-29T12:00:00.000Z"
  },
  roundSettlementTransfers: true,
  directSettlementTransfers: false,
  locked: false,
  expenses: [],
  transfers: [],
  activityLog: []
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

test("home centers new-event across the hero edge in narrow and tablet layouts", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const viewports = testInfo.project.name === "ipad-webkit"
    ? [
        { width: 768, height: 1024 },
        { width: 1194, height: 834 }
      ]
    : testInfo.project.name === "desktop-wide"
      ? [{ width: 1440, height: 1000 }]
      : [
        { width: 390, height: 844 },
        { width: 375, height: 667 },
        { width: 320, height: 568 }
      ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
    await waitForHomePresentation(page);
    await expect(page.locator(".home-create-event-action")).toBeVisible();
    await expectCenteredHomeCreateAction(page);

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
        actionPosition: action ? getComputedStyle(action).position : "",
        wrapperPosition: action ? getComputedStyle(action.parentElement).position : "",
        actionContentFits: action ? action.scrollWidth <= action.clientWidth : false,
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
    expect(["fixed", "absolute"]).not.toContain(layout.actionPosition);
    expect(layout.wrapperPosition).toBe("relative");
    expect(layout.actionContentFits).toBe(true);
    expect(layout.action.height).toBeGreaterThanOrEqual(44);
    const screenCenter = (layout.screen.left + layout.screen.right) / 2;
    if (viewport.width < 721) {
      expect(layout.action.width).toBeGreaterThanOrEqual(44);
      expect(layout.action.width).toBeLessThanOrEqual(190);
    }
    expect(layout.promo.width / layout.promo.height).toBeCloseTo(1672 / 941, 2);
    expect(layout.promoImageFit).toBe("contain");
    expect(layout.brandImageFit).toBe("contain");
    expect(layout.brandImageTransform).toBe("none");

    if (viewport.width >= 721 && viewport.width <= 1366) {
      expect(layout.screen.width).toBeCloseTo(Math.min(viewport.width - 32, 960), 0);
      // Keep the current content-sized button styling, only restore its placement.
      expect(layout.action.width).toBeGreaterThanOrEqual(44);
      expect(layout.action.width).toBeLessThanOrEqual(240);
      expect(Math.abs(screenCenter - viewport.width / 2)).toBeLessThanOrEqual(2);
    }
    await page.locator(".home-create-event-action").scrollIntoViewIfNeeded();
    await page.locator(".home-create-event-action").click({ trial: true });
    await page.screenshot({ path: testInfo.outputPath(`home-event-action-${viewport.width}.png`) });
  }
  const actionBounds = await page.locator(".home-create-event-action").boundingBox();
  // Click the upper half that overlaps the hero, not just the exposed lower half.
  await page.locator(".home-create-event-action").click({
    position: { x: actionBounds.width / 2, y: actionBounds.height / 4 }
  });
  await expect(page.locator('[data-screen-kind="new-event"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("the first-event action is identical to the regular new-event action", async ({ page, request }, testInfo) => {
  await page.goto("/");
  const emptyAction = await homeCreateActionPresentation(page);
  await expectCenteredHomeCreateAction(page);

  await request.put("/api/state", { data: populatedAccountState });
  const populatedPage = await page.context().newPage();
  await populatedPage.addInitScript((state) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({
        participantId: state.currentParticipantId,
        displayName: "ירין יצחק",
        avatarPreset: "avatar-1"
      })
    );
    localStorage.setItem("settle-friends-current-participant", state.currentParticipantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, populatedAccountState);
  await populatedPage.goto("/");
  await expect(populatedPage.locator(".event-row")).toHaveCount(1);
  const populatedAction = await homeCreateActionPresentation(populatedPage);
  await expectCenteredHomeCreateAction(populatedPage);
  await populatedPage.screenshot({ path: testInfo.outputPath("home-populated-centered-action.png") });
  await populatedPage.locator(".home-create-event-action").click();
  await expect(populatedPage.locator('[data-screen-kind="new-event"]')).toBeVisible();
  await populatedPage.close();

  expect(emptyAction.text).toBe("אירוע חדש");
  expect(populatedAction.text).toBe("אירוע חדש");
  expect(emptyAction.presentation).toEqual(populatedAction.presentation);
});

test("hero-edge action respects large text and inline feedback", async ({ page }, testInfo) => {
  await page.goto("/?dynamic-type-preview=28");
  await waitForHomePresentation(page);
  await expect(page.locator("html")).toHaveClass(/dynamic-type-preview/);
  await page.locator(".home-create-event-action").scrollIntoViewIfNeeded();
  await expectCenteredHomeCreateAction(page);
  await page.screenshot({ path: testInfo.outputPath("home-overlap-large-text.png") });

  // Exercise the CSS boundary with an inline status fixture. Unlike a fixed
  // toast, a message in document flow must never be covered by the action.
  const noticeGap = await page.locator('.screen[data-screen-kind="home"]').evaluate((screen) => {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.setAttribute("role", "status");
    notice.textContent = "הודעת בדיקה שצריכה להישאר קריאה";
    screen.querySelector(":scope > .top").after(notice);
    const action = screen.querySelector(".home-create-event-action").getBoundingClientRect();
    return action.top - notice.getBoundingClientRect().bottom;
  });
  expect(noticeGap).toBeGreaterThanOrEqual(0);
  await page.locator(".home-create-event-action").click();
  await expect(page.locator('[data-screen-kind="new-event"]')).toBeVisible();
});

test("an old event joined today appears first on home", async ({ page, request }) => {
  const syncedState = {
    ...populatedAccountState,
    events: [...populatedAccountState.events, newlyJoinedOldEvent]
  };
  await request.put("/api/state", { data: syncedState });
  await page.addInitScript((state) => {
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
  }, syncedState);
  await page.goto("/");
  await expect(page.locator(".event-row")).toHaveCount(2);
  await expect(
    page.locator(`.event-row[data-event-id="${newlyJoinedOldEvent.id}"]`)
  ).toBeVisible();
  await expect(page.locator(".event-row").first()).toContainText(
    newlyJoinedOldEvent.name
  );
});

async function homeCreateActionPresentation(page) {
  await waitForHomePresentation(page);
  const action = page.locator(".home-create-event-action");
  await expect(action).toBeVisible();
  return action.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const wrapperStyle = getComputedStyle(element.closest(".home-quick-actions"));
    return {
      text: element.textContent?.trim() ?? "",
      presentation: {
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        gap: style.gap,
        padding: style.padding,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        wrapperDisplay: wrapperStyle.display,
        wrapperWidth: wrapperStyle.width,
        wrapperMarginBlockStart: wrapperStyle.marginBlockStart,
        wrapperMarginBlockEnd: wrapperStyle.marginBlockEnd,
        wrapperGridTemplateColumns: wrapperStyle.gridTemplateColumns,
        wrapperJustifyItems: wrapperStyle.justifyItems
      }
    };
  });
}

async function expectCenteredHomeCreateAction(page) {
  const screen = page.locator('#app .screen[data-screen-kind="home"]');
  await expect(screen.locator('[data-action="new-event"]')).toHaveCount(1);
  await expect(screen.locator('.home-events-heading [data-action="new-event"]')).toHaveCount(0);
  const placement = await screen.evaluate((element) => {
    const hero = element.querySelector(":scope > .top").getBoundingClientRect();
    const button = element.querySelector('[data-action="new-event"]');
    const action = button.getBoundingClientRect();
    const copy = element.querySelector(":scope > .top .brand").getBoundingClientRect();
    const benefits = element.querySelector(".home-benefit-actions").getBoundingClientRect();
    const wrapper = element.querySelector(".home-quick-actions");
    return {
      directChild: wrapper.parentElement === element,
      centerOffset: Math.abs((action.left + action.right - hero.left - hero.right) / 2),
      edgeOffset: Math.abs((action.top + action.bottom) / 2 - hero.bottom),
      copyGap: action.top - copy.bottom,
      bothHalvesClickable: [0.25, 0.75].every((fraction) =>
        button.contains(document.elementFromPoint((action.left + action.right) / 2, action.top + action.height * fraction))
      ),
      benefitsGap: benefits.top - action.bottom,
      withinHeroWidth: action.left >= hero.left && action.right <= hero.right
    };
  });
  expect(placement.directChild).toBe(true);
  expect(placement.centerOffset).toBeLessThanOrEqual(1);
  expect(placement.edgeOffset).toBeLessThanOrEqual(3);
  expect(placement.copyGap).toBeGreaterThanOrEqual(0);
  expect(placement.bothHalvesClickable).toBe(true);
  expect(placement.benefitsGap).toBeGreaterThanOrEqual(12);
  expect(placement.withinHeroWidth).toBe(true);
}

async function waitForHomePresentation(page) {
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("ledger-workspace-v1") &&
    document.getElementById("public-ledger-workspace-layer-style") &&
    document.getElementById("public-design-coherence-layer-style") &&
    document.getElementById("public-dynamic-type-style") &&
    document.getElementById("public-mobile-fullscreen-modal-layer")
  );
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete ? image.decode?.().catch(() => {}) : Promise.resolve()
      )
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
  // The public motion layer intentionally finishes the first screen reveal in
  // 500ms. Measure only the settled layout, never a translucent mid-frame.
  await page.waitForTimeout(600);
}
