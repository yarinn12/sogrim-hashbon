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

test("the empty home hero stays intact on iPhone and iPad", async ({ page }, testInfo) => {
  test.skip(
    !["iphone-webkit", "iphone-large-text", "ipad-webkit"].includes(testInfo.project.name),
    "This regression targets iOS and iPadOS layouts"
  );

  const viewports = testInfo.project.name === "ipad-webkit"
    ? [
        { width: 768, height: 1024 },
        { width: 1194, height: 834 }
      ]
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
    expect(layout.action.top).toBeGreaterThanOrEqual(layout.hero.bottom + 12);
    expect(layout.action.top).toBeLessThanOrEqual(layout.hero.bottom + 28);
    expect(layout.action.height).toBeGreaterThanOrEqual(44);
    const screenCenter = (layout.screen.left + layout.screen.right) / 2;
    const actionHorizontalCenter = (layout.action.left + layout.action.right) / 2;
    expect(Math.abs(actionHorizontalCenter - screenCenter)).toBeLessThanOrEqual(2);
    if (viewport.width < 721) {
      expect(layout.action.width).toBeGreaterThanOrEqual(174);
      expect(layout.action.width).toBeLessThanOrEqual(190);
    }
    expect(layout.promo.width / layout.promo.height).toBeCloseTo(1672 / 941, 2);
    expect(layout.promoImageFit).toBe("contain");
    expect(layout.brandImageFit).toBe("contain");
    expect(layout.brandImageTransform).toBe("none");

    if (viewport.width >= 721) {
      expect(layout.screen.width).toBeCloseTo(Math.min(viewport.width - 32, 960), 0);
      expect(layout.action.width).toBe(240);
      expect(Math.abs(screenCenter - viewport.width / 2)).toBeLessThanOrEqual(2);
    }
  }
});

test("the first-event action is identical to the regular new-event action", async ({ page, request }) => {
  await page.goto("/");
  const emptyAction = await homeCreateActionPresentation(page);

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
  await populatedPage.close();

  expect(emptyAction.text).toBe("אירוע חדש");
  expect(populatedAction.text).toBe("אירוע חדש");
  expect(emptyAction.presentation).toEqual(populatedAction.presentation);
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
