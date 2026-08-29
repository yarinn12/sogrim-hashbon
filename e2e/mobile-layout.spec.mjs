import { expect, test } from "@playwright/test";

import { calculateSettlement } from "../src/domain/settlement.mjs";

const EVENT_ID = "event-layout-ci";
const OWNER_ID = "person-owner";
const MAOR_ID = "account-12345678-1234-4123-8123-123456789abc";
const AVAILABLE_FRIEND_ID = "account-87654321-4321-4321-8321-cba987654321";
let runtimeIssues = [];

const participants = [
  {
    id: OWNER_ID,
    displayName: "ירין יצחק",
    kind: "user",
    avatarPreset: "avatar-1"
  },
  {
    id: MAOR_ID,
    displayName: "Awesome Maor · מאור סיבוני",
    kind: "user",
    avatarPreset: "avatar-2",
    accountLinked: true,
    username: "awesome_maor"
  },
  {
    id: "person-ariel",
    displayName: "אריאל ניזרי מהטיול המשפחתי",
    kind: "guest"
  },
  {
    id: "person-harel",
    displayName: "הראל כהן",
    kind: "guest"
  }
];

const expenses = [
  {
    id: "expense-dinner",
    name: "ארוחת ערב במסעדת השוק",
    total: 24_000,
    payers: [{ participantId: OWNER_ID, amount: 24_000 }],
    sharedByParticipantIds: participants.map(({ id }) => id),
    createdByParticipantId: OWNER_ID,
    occurredOn: "2026-08-03",
    updatedAt: "2026-08-03T18:30:00.000Z"
  },
  {
    id: "expense-taxi",
    name: "Taxi to Tel Aviv · מונית חזרה",
    total: 7_600,
    payers: [{ participantId: MAOR_ID, amount: 7_600 }],
    sharedByParticipantIds: [OWNER_ID, MAOR_ID, "person-ariel"],
    createdByParticipantId: MAOR_ID,
    occurredOn: "2026-08-03",
    updatedAt: "2026-08-03T20:00:00.000Z"
  }
];

const transfers = calculateSettlement(participants, expenses, {
  roundTransfers: true
}).transfers.map((transfer) => ({ ...transfer, status: "pending" }));

const seededState = {
  currentParticipantId: OWNER_ID,
  participants,
  friendContacts: [],
  groups: [],
  events: [
    {
      id: EVENT_ID,
      name: "סופ״ש Lisbon 2026 · משפחת כהן",
      eventType: "trip",
      currency: "ILS",
      participantIds: participants.map(({ id }) => id),
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-03T17:00:00.000Z",
      updatedAt: "2026-08-03T20:00:00.000Z",
      statusUpdatedAt: "2026-08-03T20:00:00.000Z",
      roundSettlementTransfers: true,
      expenses,
      transfers,
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page, request }, testInfo) => {
  runtimeIssues = [];
  page.on("pageerror", (error) => runtimeIssues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !text.startsWith("Failed to load resource:") &&
      text !== 'Viewport argument key "interactive-widget" not recognized and ignored.'
    ) {
      runtimeIssues.push(`console: ${text}`);
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

  await request.post("/api/reset");
  await request.put("/api/state", { data: seededState });

  await page.addInitScript(({ participantId, displayName, state }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem(
      "settle-friends-local-profile",
      JSON.stringify({ participantId, displayName, avatarPreset: "avatar-1" })
    );
    localStorage.setItem("settle-friends-current-participant", participantId);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { participantId: OWNER_ID, displayName: "ירין יצחק", state: seededState });

  const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
  await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
  await expect(
    page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first()
  ).toBeVisible();
});

test.afterEach(() => {
  expect(runtimeIssues, "the core mobile journey must not emit browser runtime errors").toEqual([]);
});

test("participant pictures never cover the event title or participant count", async ({
  page,
  request
}) => {
  const largeState = structuredClone(seededState);
  const extraParticipants = Array.from({ length: 121 }, (_, index) => ({
    id: `person-scale-${index + 1}`,
    displayName: `משתתף ${index + 1}`,
    kind: "guest"
  }));
  largeState.participants.push(...extraParticipants);
  largeState.events[0].participantIds.push(
    ...extraParticipants.map((participant) => participant.id)
  );
  await request.put("/api/state", { data: largeState });
  await settleServiceWorkerBeforeReload(page);
  await page.addInitScript((nextState) => {
    localStorage.setItem("settle-friends-state", JSON.stringify(nextState));
  }, largeState);
  await page.reload();

  const eventRow = page.locator(`[data-event-id="${EVENT_ID}"]`).first();
  const stack = eventRow.locator(".avatar-stack");
  const count = eventRow.locator(".event-row-meta > span").last();
  await expect(stack.locator(":scope > .avatar")).toHaveCount(3);
  await expect(stack.locator(".avatar-more")).toHaveText("+99+");
  await expect(count).toHaveText("125 משתתפים");

  const geometry = await eventRow.evaluate((element) => {
    const stackRect = element.querySelector(".avatar-stack")?.getBoundingClientRect();
    const mainRect = element.querySelector(".event-row-main")?.getBoundingClientRect();
    const countRect = element.querySelector(".event-row-meta > span:last-child")?.getBoundingClientRect();
    const overlap = (first, second) => first && second
      ? Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
      : -1;
    return {
      stackMainOverlap: overlap(stackRect, mainRect),
      stackCountOverlap: overlap(stackRect, countRect),
      stackWidth: stackRect?.width ?? 0,
      rowWidth: element.getBoundingClientRect().width
    };
  });
  expect(geometry.stackMainOverlap).toBe(0);
  expect(geometry.stackCountOverlap).toBe(0);
  expect(geometry.stackWidth).toBeLessThan(geometry.rowWidth);
  await assertLayoutHealth(page, "large event participant count");
});

test("adding a saved friend requires an explicit confirmation and keeps the picker on-brand", async ({
  page,
  request
}) => {
  const availableFriend = {
    id: AVAILABLE_FRIEND_ID,
    displayName: "נועה חברה",
    kind: "user",
    accountLinked: true,
    username: "noa_friend",
    avatarPreset: "avatar-3"
  };
  const augmentedState = structuredClone(seededState);
  augmentedState.participants.push(availableFriend);
  augmentedState.friendContacts = [
    {
      participantId: AVAILABLE_FRIEND_ID,
      active: true,
      source: "account",
      updatedAt: "2026-08-03T20:05:00.000Z"
    }
  ];
  await request.put("/api/state", { data: augmentedState });
  await settleServiceWorkerBeforeReload(page);
  await page.addInitScript((nextState) => {
    localStorage.setItem("settle-friends-state", JSON.stringify(nextState));
  }, augmentedState);
  await page.reload();

  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page
    .locator('.event-participant-roster-modal [data-action="open-event-participant-add"]')
    .click();
  const addRoute = page.locator(".event-participant-add-route-modal");
  await addRoute
    .locator('[data-action="set-event-participant-add-view"][data-participant-view="friends"]')
    .click();

  await expect(addRoute.locator(".event-modal-header .eyebrow")).toHaveCount(0);
  const candidate = addRoute.locator(
    `[data-action="select-event-participant-candidate"][data-participant-id="${AVAILABLE_FRIEND_ID}"]`
  );
  const confirm = addRoute.locator('[data-action="confirm-event-participant-add"]');
  await expect(candidate).toHaveText(/בחר/);
  await expect(confirm).toBeDisabled();

  await candidate.click();
  await expect(candidate).toHaveAttribute("aria-pressed", "true");
  await expect(candidate).toHaveText(/נבחר/);
  await expect(confirm).toBeEnabled();
  expect(
    await page.evaluate(({ eventId, participantId }) => {
      const state = JSON.parse(localStorage.getItem("settle-friends-state") || "{}");
      return state.events
        ?.find((event) => event.id === eventId)
        ?.participantIds?.includes(participantId);
    }, { eventId: EVENT_ID, participantId: AVAILABLE_FRIEND_ID })
  ).toBe(false);
  await assertLayoutHealth(page, "saved friend confirmation");

  await confirm.click();
  const roster = page.locator(".event-participant-roster-modal");
  await expect(roster).toBeVisible();
  await expect(
    roster.locator(
      `.event-participant-roster-row[data-participant-id="${AVAILABLE_FRIEND_ID}"]`
    )
  ).toBeVisible();
});

test("an event without expenses presents one clear empty summary card", async ({ page, request }) => {
  const emptyState = structuredClone(seededState);
  emptyState.events[0].expenses = [];
  emptyState.events[0].transfers = [];
  await request.put("/api/state", { data: emptyState });
  await settleServiceWorkerBeforeReload(page);
  await page.addInitScript((nextState) => {
    localStorage.setItem("settle-friends-state", JSON.stringify(nextState));
  }, emptyState);
  await page.reload();

  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page.locator('[data-action="settle"]').first().click();

  const emptySummary = page.locator(".event-empty-expense-summary");
  await expect(emptySummary).toBeVisible();
  await expect(emptySummary.locator("h2")).toHaveText("אין עדיין סיכום");
  await expect(emptySummary.locator(".event-empty-expense-eyebrow")).toHaveCount(0);
  await expect(emptySummary.locator('[data-action="show-expense-form"]')).toBeVisible();
  await assertLayoutHealth(page, "empty summary card");
});

test("another person's picture alone opens shared statistics while editable text stays selectable", async ({
  page
}) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const currentParticipantRow = page.locator(
    `[data-action="open-event-settings"][data-participant-id="${OWNER_ID}"]`
  );
  const currentParticipantAvatar = currentParticipantRow.locator(
    '.avatar[data-action="edit-profile"]'
  );
  await expect(currentParticipantAvatar).toHaveAttribute("aria-label", "פתיחת הפרופיל שלך");
  const currentParticipantAvatarImage = currentParticipantAvatar.locator("img");
  await expect(currentParticipantAvatarImage).toBeVisible();
  const currentParticipantAvatarRendering = await currentParticipantAvatar.evaluate((avatar) => {
    const image = avatar.querySelector("img");
    const imageStyle = image ? getComputedStyle(image) : null;
    const interactionTargetStyle = getComputedStyle(avatar, "::before");
    const statusMarkerStyle = getComputedStyle(avatar, "::after");
    return {
      imageLoaded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      imageDisplay: imageStyle?.display,
      imageVisibility: imageStyle?.visibility,
      interactionTargetWidth: Number.parseFloat(interactionTargetStyle.width),
      interactionTargetHeight: Number.parseFloat(interactionTargetStyle.height),
      statusMarkerWidth: statusMarkerStyle.width,
      statusMarkerHeight: statusMarkerStyle.height
    };
  });
  expect(currentParticipantAvatarRendering).toEqual(
    expect.objectContaining({
      imageLoaded: true,
      imageDisplay: "block",
      imageVisibility: "visible"
    })
  );
  expect(currentParticipantAvatarRendering.interactionTargetWidth).toBeGreaterThanOrEqual(44);
  expect(currentParticipantAvatarRendering.interactionTargetHeight).toBeGreaterThanOrEqual(44);
  expect(currentParticipantAvatarRendering.statusMarkerWidth).not.toBe("44px");
  expect(currentParticipantAvatarRendering.statusMarkerHeight).not.toBe("44px");
  await currentParticipantRow.locator(".event-participant-person-copy").click();
  await expect(page.locator('.event-settings-modal[role="region"]')).toBeVisible();
  await page.goBack();
  await expect(currentParticipantRow).toBeVisible();
  await currentParticipantAvatar.click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.goBack();
  await expect(currentParticipantRow).toBeVisible();

  const participantRow = page.locator(
    `[data-action="open-event-participant-profile"][data-participant-id="${MAOR_ID}"]`
  );
  const participantAvatar = participantRow.locator(
    '.avatar[data-action="open-participant-statistics"]'
  );
  await expect(participantAvatar).toHaveAttribute("role", "button");
  await expect(participantAvatar).toHaveAttribute("tabindex", "0");
  await expect(
    participantRow.locator(".event-participant-person-copy")
  ).not.toHaveAttribute("data-action", "open-participant-statistics");

  await participantAvatar.click();
  const statisticsScreen = page.locator(
    `.friend-relationship-screen[data-friend-profile-id="${MAOR_ID}"]`
  );
  await expect(statisticsScreen).toBeVisible();
  await expect(statisticsScreen.getByText("אתם במספרים", { exact: true })).toBeVisible();
  const relationshipSides = await statisticsScreen
    .locator(".relationship-duo")
    .evaluate((element) => {
      const current = element.querySelector('[data-relationship-person="current"]');
      const target = element.querySelector('[data-relationship-person="target"]');
      return {
        currentX: current?.getBoundingClientRect().x ?? -1,
        targetX: target?.getBoundingClientRect().x ?? -1
      };
    });
  expect(relationshipSides.currentX).toBeGreaterThan(relationshipSides.targetX);
  const comparisonSides = await statisticsScreen
    .locator(".relationship-comparison-values")
    .first()
    .evaluate((element) => {
      const current = element.querySelector('[data-relationship-person="current"]');
      const target = element.querySelector('[data-relationship-person="target"]');
      return {
        currentX: current?.getBoundingClientRect().x ?? -1,
        targetX: target?.getBoundingClientRect().x ?? -1
      };
    });
  expect(comparisonSides.currentX).toBeGreaterThan(comparisonSides.targetX);
  const comparisonValueAlignment = await statisticsScreen
    .locator(".relationship-comparison-values")
    .first()
    .evaluate((element) => {
      const current = element.querySelector('[data-relationship-person="current"]');
      const target = element.querySelector('[data-relationship-person="target"]');
      const currentValue = current?.querySelector(".font-num");
      const targetValue = target?.querySelector(".font-num");
      const currentRect = current?.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      const currentValueRect = currentValue?.getBoundingClientRect();
      const targetValueRect = targetValue?.getBoundingClientRect();
      return {
        currentEdgeGap: Math.abs((currentRect?.right ?? 0) - (currentValueRect?.right ?? 0)),
        targetEdgeGap: Math.abs((targetValueRect?.left ?? 0) - (targetRect?.left ?? 0))
      };
    });
  expect(comparisonValueAlignment.currentEdgeGap).toBeLessThanOrEqual(2);
  expect(comparisonValueAlignment.targetEdgeGap).toBeLessThanOrEqual(2);
  if (process.env.CAPTURE_PARTICIPANT_STATS === "1") {
    await page.screenshot({
      path: `design-audits/participant-statistics-${test.info().project.name}.png`,
      fullPage: false
    });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
  const headingSelection = await statisticsScreen.locator("h1").evaluate((element) => {
    const styles = getComputedStyle(element);
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    return {
      canceled: !element.dispatchEvent(event),
      css: styles.userSelect || styles.webkitUserSelect
    };
  });
  expect(headingSelection).toEqual({ canceled: true, css: "none" });

  await page.goBack();
  await expect(participantRow).toBeVisible();
  await participantRow.locator(".event-participant-person-copy").click();
  await expect(page.locator(".event-participant-management-modal")).toBeVisible();

  await page.goBack();
  await page.goBack();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  const editableAmount = page.locator('[data-action="expense-total"]');
  const editableSelection = await editableAmount.evaluate((element) => {
    const styles = getComputedStyle(element);
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    return {
      canceled: !element.dispatchEvent(event),
      css: styles.userSelect || styles.webkitUserSelect
    };
  });
  expect(editableSelection).toEqual({ canceled: false, css: "text" });
});

test("iPad event screens use the same compact canvas as iPhone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "ipad-webkit");
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();

  const layout = await page.locator('.screen[data-screen-kind="event"]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, viewportWidth: window.innerWidth };
  });
  expect(layout.width).toBeGreaterThanOrEqual(390);
  expect(layout.width).toBeLessThanOrEqual(432);
});

test("iPad home, notifications and profile share a stable phone canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "ipad-webkit");

  for (const viewport of [
    { width: 834, height: 1194 },
    { width: 1194, height: 834 }
  ]) {
    await page.setViewportSize(viewport);
    if (!(await page.locator('#app .screen[data-screen-kind="home"]').isVisible())) {
      await page.locator('[data-nav-destination="home"]').click();
    }
    await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();

    const homeWidth = await page.locator('#app .screen[data-screen-kind="home"]').evaluate(
      (element) => element.getBoundingClientRect().width
    );
    expect(homeWidth).toBeGreaterThanOrEqual(390);
    expect(homeWidth).toBeLessThanOrEqual(432);
    await assertLayoutHealth(page, `iPad home ${viewport.width}x${viewport.height}`);

    await page.locator('[data-nav-destination="notifications"]').click();
    const notifications = page.locator('.screen[data-screen-kind="notifications"]');
    await expect(notifications).toBeVisible();
    const notificationTopState = await page.evaluate(() => ({
      scrollY: Math.round(window.scrollY),
      screenTop: Math.round(document.querySelector('.screen[data-screen-kind="notifications"]')?.getBoundingClientRect().top ?? -1),
      identityTop: Math.round(document.querySelector('.screen[data-screen-kind="notifications"] > .product-app-identity')?.getBoundingClientRect().top ?? -1),
      brandTop: Math.round(document.querySelector('.screen[data-screen-kind="notifications"] > .product-app-identity > .product-brand-lockup')?.getBoundingClientRect().top ?? -1)
    }));
    expect(notificationTopState).toEqual({
      scrollY: 0,
      screenTop: expect.any(Number),
      identityTop: expect.any(Number),
      brandTop: expect.any(Number)
    });
    expect(notificationTopState.screenTop).toBeGreaterThanOrEqual(0);
    expect(notificationTopState.identityTop).toBeGreaterThanOrEqual(0);
    expect(notificationTopState.brandTop).toBeGreaterThanOrEqual(0);
    const notificationsWidth = await notifications.evaluate(
      (element) => element.getBoundingClientRect().width
    );
    expect(notificationsWidth).toBeGreaterThanOrEqual(390);
    expect(notificationsWidth).toBeLessThanOrEqual(432);
    await assertLayoutHealth(page, `iPad notifications ${viewport.width}x${viewport.height}`);

    await page.locator('[data-nav-destination="profile"]').click();
    const profile = page.locator('.screen[data-screen-kind="profile"]');
    await expect(profile).toBeVisible();
    const profileWidth = await profile.evaluate(
      (element) => element.getBoundingClientRect().width
    );
    expect(profileWidth).toBeGreaterThanOrEqual(390);
    expect(profileWidth).toBeLessThanOrEqual(432);
    await assertLayoutHealth(page, `iPad profile ${viewport.width}x${viewport.height}`);
  }
});

test("iPad new-event steps always start inside the visible canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "ipad-webkit");

  await page.locator('[data-action="new-event"]').first().click();
  await expect(page.locator('[data-event-creation-step="type"]')).toBeVisible();
  await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
  const details = page.locator('[data-event-creation-step="details"]');
  await expect(details).toBeVisible();

  await expect.poll(async () => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  const topState = await details.evaluate((element) => {
    const identity = element.querySelector(':scope > .product-app-identity');
    const hero = element.querySelector(':scope > .top');
    return {
      screenTop: Math.round(element.getBoundingClientRect().top),
      identityTop: Math.round(identity?.getBoundingClientRect().top ?? -1),
      heroTop: Math.round(hero?.getBoundingClientRect().top ?? -1)
    };
  });
  expect(topState.screenTop).toBeGreaterThanOrEqual(0);
  expect(topState.identityTop).toBeGreaterThanOrEqual(0);
  expect(topState.heroTop).toBeGreaterThanOrEqual(0);
  await assertLayoutHealth(page, "iPad new event details visible top");
});

test("offline mode keeps shared event changes local-first until sync access returns", async ({
  page,
  context
}) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page
    .locator(`[data-action="open-event-participant-profile"][data-participant-id="${MAOR_ID}"]`)
    .click();

  const adminToggle = page.locator('[data-action="toggle-event-participant-admin"]');
  await expect(adminToggle).not.toBeChecked();

  await context.setOffline(true);
  const syncToast = page.locator("[data-sync-status]");
  await expect(adminToggle).not.toHaveAttribute("aria-disabled", "true");
  await expect(syncToast).toBeHidden();

  await adminToggle.click();
  await expect(adminToggle).toBeChecked();
  await expect(syncToast).toBeHidden();

  await page.goBack();
  await expect(page.locator(".event-participant-roster-modal")).toBeVisible();

  await context.setOffline(false);
  await page
    .locator(`[data-action="open-event-participant-profile"][data-participant-id="${MAOR_ID}"]`)
    .click();
  const reconnectedAdminToggle = page.locator(
    '[data-action="toggle-event-participant-admin"]'
  );
  await expect(reconnectedAdminToggle).not.toHaveAttribute("aria-disabled", "true");
  await expect(reconnectedAdminToggle).toBeChecked();
  await reconnectedAdminToggle.uncheck();
  await expect(reconnectedAdminToggle).not.toBeChecked();
});

test("routine background sync never opens a sync surface", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page
    .locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const routeStatus = page.locator("[data-route-sync-status]");
  await expect(routeStatus).toBeHidden();

  for (const status of ["saving", "saved", "reconnecting", "unavailable"]) {
    await page.evaluate((nextStatus) => {
      window.dispatchEvent(new CustomEvent("sogrim:sync-status", {
        detail: { status: nextStatus }
      }));
    }, status);
    await expect(page.locator("[data-sync-status]")).toBeHidden();
    await expect(routeStatus).toBeHidden();
    await expect(page.locator("[data-inline-sync-status]")).toBeHidden();
  }
});

test("expense notes and image stay visible after save and resume sync", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();

  const expense = page.locator('[data-expense-id="expense-taxi"]');
  await expense.locator(".expense-row-actions-menu summary").click();
  await expense.locator('[data-action="edit-expense-notes"]').click();

  const dialog = page.locator(".expense-notes-modal");
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-action="expense-notes"]').fill("איסוף מטרמינל שלוש");
  await dialog.locator('[data-action="expense-attachment-image"]:not([data-image-source])').setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mP8z8DAwMAAAAYAAQHLR3cAAAAASUVORK5CYII=",
      "base64"
    )
  });
  await expect(dialog.locator(".expense-attachment-preview")).toBeVisible();
  await dialog.locator('[data-action="save-expense"]').click();

  await expect(dialog).toBeHidden();
  await expense.locator('[data-action="toggle-expense-participants"]').click();
  await expect(expense.locator(".expense-saved-notes")).toHaveText(
    "איסוף מטרמינל שלוש"
  );
  await expect(expense.locator(".expense-saved-image")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("settle-friends:native-resume"));
  });
  await expect(expense.locator(".expense-saved-image")).toBeVisible();
});

test("expense overflow visually matches the event image menu", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();

  const menu = page.locator('[data-expense-id="expense-taxi"] .expense-row-actions-menu');
  await menu.locator(":scope > summary").click();
  await expect(menu).toHaveAttribute("open", "");
  await expect
    .poll(() =>
      menu
        .locator(":scope > summary")
        .evaluate((element) => getComputedStyle(element).backgroundColor)
    )
    .toBe("rgb(255, 255, 255)");

  const presentation = await menu.evaluate((element) => {
    const trigger = element.querySelector(":scope > summary");
    const panel = element.querySelector(":scope > div");
    const firstAction = panel?.querySelector("button");
    const dangerAction = panel?.querySelector('[data-action="delete-expense"]');
    const triggerStyle = getComputedStyle(trigger);
    const panelStyle = getComputedStyle(panel);
    const actionStyle = getComputedStyle(firstAction);
    const dangerStyle = getComputedStyle(dangerAction);
    return {
      trigger: {
        width: triggerStyle.width,
        height: triggerStyle.height,
        radius: triggerStyle.borderRadius,
        background: triggerStyle.backgroundColor
      },
      panel: {
        width: panelStyle.width,
        padding: panelStyle.padding,
        radius: panelStyle.borderRadius,
        background: panelStyle.backgroundColor
      },
      action: {
        minHeight: actionStyle.minHeight,
        borderWidth: actionStyle.borderTopWidth,
        radius: actionStyle.borderRadius,
        background: actionStyle.backgroundColor
      },
      dangerColor: dangerStyle.color
    };
  });

  expect(presentation).toEqual({
    trigger: {
      width: "44px",
      height: "44px",
      radius: "12px",
      background: "rgb(255, 255, 255)"
    },
    panel: {
      width: "166px",
      padding: "8px",
      radius: "12px",
      background: "rgb(255, 255, 255)"
    },
    action: {
      minHeight: "44px",
      borderWidth: "0px",
      radius: "10px",
      background: "rgba(0, 0, 0, 0)"
    },
    dangerColor: "rgb(163, 58, 50)"
  });
});

test("iPad landscape keeps expense entry inside the centered phone canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "ipad-webkit", "iPad-specific landscape guard");
  await page.setViewportSize({ width: 1194, height: 834 });
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const dialog = page.locator(".expense-step-modal");
  await expect(dialog).toBeVisible();
  const nav = page.locator(".event-route-primary-nav");
  await expect(nav).toBeVisible();
  const rect = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      top: Math.round(bounds.top),
      left: Math.round(bounds.left),
      right: Math.round(bounds.right),
      bottom: Math.round(bounds.bottom),
      radius: getComputedStyle(element).borderRadius
    };
  });
  expect(rect.top).toBeLessThanOrEqual(4);
  expect(rect.left).toBeGreaterThanOrEqual(380);
  expect(rect.left).toBeLessThanOrEqual(384);
  expect(rect.right).toBeGreaterThanOrEqual(810);
  expect(rect.right).toBeLessThanOrEqual(814);
  const navTop = await nav.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top)
  );
  expect(rect.bottom).toBeLessThanOrEqual(navTop + 4);
  expect(rect.bottom).toBeGreaterThanOrEqual(navTop - 24);
  await expect(dialog.locator(".expense-modal-actions")).toBeVisible();
  await expect(dialog.locator('[data-action="expense-step-next"]')).toBeInViewport();
  expect(rect.radius).toBe("0px");
});

test("close-event action and its floating feedback stay polished on every mobile profile", async ({ page }, testInfo) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  const summaryTab = page
    .locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`)
    .first();
  await summaryTab.scrollIntoViewIfNeeded();
  await summaryTab.click();

  const closeButton = page.locator(".settlement-close-primary").first();
  await expect(closeButton).toBeVisible();
  const closeButtonLayout = await closeButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const availableWidth = parent
      ? parent.clientWidth
        - Number.parseFloat(parentStyle?.paddingInlineStart || "0")
        - Number.parseFloat(parentStyle?.paddingInlineEnd || "0")
      : rect.width;
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      whiteSpace: style.whiteSpace,
      availableWidth: Math.round(availableWidth)
    };
  });
  expect(closeButtonLayout.width).toBeGreaterThanOrEqual(closeButtonLayout.availableWidth - 2);
  expect(closeButtonLayout.height).toBeGreaterThanOrEqual(56);
  expect(closeButtonLayout.scrollHeight).toBeLessThanOrEqual(
    closeButtonLayout.clientHeight + 1
  );
  expect(closeButtonLayout.whiteSpace).toBe("normal");

  await closeButton.click();
  await page.locator('[data-action="confirm-close-event"]').click();

  const toast = page.locator(".app-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("האירוע נסגר וננעל לעריכה");
  const toastLayout = await toast.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      position: style.position,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(innerHeight - rect.bottom),
      width: Math.round(rect.width),
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      viewportWidth: innerWidth
    };
  });
  expect(toastLayout.position).toBe("fixed");
  expect(toastLayout.left).toBeGreaterThanOrEqual(13);
  expect(toastLayout.right).toBeLessThanOrEqual(toastLayout.viewportWidth - 13);
  expect(toastLayout.top).toBeGreaterThanOrEqual(0);
  expect(toastLayout.bottom).toBeGreaterThanOrEqual(95);
  expect(toastLayout.width).toBeLessThanOrEqual(520);
  expect(toastLayout.backgroundColor).toBe("rgb(251, 254, 253)");
  expect(toastLayout.borderRadius).toBe("12px");

  const dismissButton = toast.locator('[data-action="dismiss-notice"]');
  const dismissSize = await dismissButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  expect(dismissSize).toEqual({ width: 44, height: 44 });
  if (process.env.CAPTURE_CLOSE_TOAST === "1") {
    await page.screenshot({
      path: `audit/close-event-toast-${testInfo.project.name}.png`,
      fullPage: false
    });
  }
  await dismissButton.click();
  await expect(toast).toHaveCount(0);
});

test("core mobile journey remains readable, reachable and correctly layered", async ({ page }) => {
  await assertDocumentDirection(page);
  await assertLayoutHealth(page, "home");
  if (process.env.CAPTURE_COHERENCE_ALL === "1") {
    await captureCoherenceScreen(page, "01-home");
  }

  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .locator(".event-row-main")
    .click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT_ID}"]`))
    .toBeVisible();
  await assertLayoutHealth(page, "event expenses");

  const firstExpenseRow = page.locator(".expense-row").first();
  const firstExpenseParticipants = firstExpenseRow.locator(".expense-participants-details");
  const firstExpenseDisclosure = firstExpenseRow.locator(
    '[data-action="toggle-expense-participants"]'
  );
  await expect(firstExpenseDisclosure).toHaveAttribute("aria-expanded", "false");
  await expect(firstExpenseParticipants).not.toHaveAttribute("open", "");
  await firstExpenseDisclosure.click();
  await expect(firstExpenseDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(firstExpenseParticipants).toHaveAttribute("open", "");
  await assertLayoutHealth(page, "expanded expense participants");
  await firstExpenseDisclosure.click();
  await expect(firstExpenseParticipants).not.toHaveAttribute("open", "");

  const firstExpenseMenu = firstExpenseRow.locator(".expense-row-actions-menu");
  await firstExpenseMenu.locator(":scope > summary").click();
  await expect(firstExpenseMenu).toHaveAttribute("open", "");
  await expect(firstExpenseParticipants).not.toHaveAttribute("open", "");
  await page.locator("#event-expenses-title").click();
  await expect(firstExpenseMenu).not.toHaveAttribute("open", "");

  if (process.env.CAPTURE_EVENT_LEDGER === "1") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "design-audits/event-ledger-approved-current.png",
      fullPage: false
    });
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await expect(page.locator('[data-event-view="summary"]')).toBeVisible();
  await expect(page.locator(".event-workspace-nav")).toBeVisible();
  await expect(page.locator(".event-workspace-nav")).toHaveCSS("position", "static");
  await assertLayoutHealth(page, "event summary");
  await assertCompactSettlementFirstView(page);

  const keyboardTransfer = page.locator('.transfer-row:has(.transfer-explanation)').first();
  if (await keyboardTransfer.count()) {
    const explanation = keyboardTransfer.locator('.transfer-explanation');
    await keyboardTransfer.focus();
    await keyboardTransfer.press("Enter");
    await expect(keyboardTransfer).toHaveAttribute("aria-expanded", "true");
    await expect(explanation).toHaveAttribute("open", "");
    await keyboardTransfer.press("Space");
    await expect(keyboardTransfer).toHaveAttribute("aria-expanded", "false");
    await expect(explanation).not.toHaveAttribute("open", "");
  }

  const settlementCalculation = page.locator(".settlement-featured-breakdown").first();
  if (await settlementCalculation.count()) {
    await expect(settlementCalculation).not.toHaveAttribute("open", "");
    await expect(
      settlementCalculation.locator(":scope > summary")
    ).toContainText("איך חישבנו?");
    await settlementCalculation.locator(":scope > summary").click();
    await expect(settlementCalculation).toHaveAttribute("open", "");
    await expect(
      settlementCalculation.locator(".settlement-featured-breakdown-body")
    ).toBeVisible();
    await assertLayoutHealth(page, "expanded settlement calculation");
    await settlementCalculation.locator(":scope > summary").click();
    await expect(settlementCalculation).not.toHaveAttribute("open", "");
  }

  const settlementMoreActions = page.locator(".settlement-more-actions").first();
  if (await settlementMoreActions.count()) {
    await settlementMoreActions.locator(":scope > summary").click();
    await expect(settlementMoreActions).toHaveAttribute("open", "");
    await page.locator(".settlement-stage-heading h2").click();
    await expect(settlementMoreActions).not.toHaveAttribute("open", "");
  }

  if (process.env.CAPTURE_EVENT_SUMMARY === "1") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "design-audits/event-summary-current.png",
      fullPage: false
    });
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .locator(`[data-action="back-to-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT_ID}"]`))
    .toBeVisible();

  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  const expenseDialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(expenseDialog).toBeVisible();
  await expect(expenseDialog).toHaveAttribute("aria-labelledby", /.+/);
  await expect(expenseDialog).toHaveAttribute("aria-describedby", /.+/);
  await expect(page.locator(".event-action-dock")).toHaveCount(0);
  await assertFocusedControlIsVisible(page);
  await assertLayoutHealth(page, "expense dialog");
  await assertSingleDecisionExpenseStep(page);
  if (process.env.CAPTURE_EXPENSE_DIALOG === "1") {
    await page.screenshot({
      path: "design-audits/expense-dialog-current.png",
      fullPage: false
    });
  }

  await assertExpenseStepStartsAtTop(page, "amount");
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.locator('[data-action="expense-step-next"]').click();
  await assertExpenseStepStartsAtTop(page, "name");
  await page.locator('[data-action="expense-name"]').fill("בדיקת יציבות");
  await page.locator('[data-action="expense-step-next"]').click();
  await assertExpenseStepStartsAtTop(page, "payer");
  await page.locator(".expense-flow-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.locator('[data-action="expense-step-next"]').click();
  await assertExpenseStepStartsAtTop(page, "participants");
  await page.locator('[data-action="expense-step-next"]').click();
  await assertExpenseStepStartsAtTop(page, "review");
  for (const step of ["participants", "payer", "name", "amount"]) {
    await page.locator('[data-action="expense-step-back"]').click();
    await assertExpenseStepStartsAtTop(page, step);
  }
  await page.locator('[data-action="cancel-expense"]').click();
  await expect(expenseDialog).toBeHidden();

  await page
    .locator(`[data-action="open-event-participants"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  const participantsRoute = page.locator(
    '.event-participant-roster-modal[role="region"][aria-labelledby="event-modal-title"]'
  );
  await expect(participantsRoute).toBeVisible();
  await expect(page.locator('.event-action-dock')).toHaveCount(0);
  await assertLayoutHealth(page, "participants dialog");
  if (process.env.CAPTURE_EVENT_PARTICIPANTS === "1") {
    await page.waitForTimeout(550);
    await page.screenshot({
      path: "design-audits/event-participants-current.png",
      fullPage: false
    });
  }

  const addParticipantLaunch = participantsRoute.locator(
    '[data-action="open-event-participant-add"]'
  );
  await expect(addParticipantLaunch).toBeVisible();

  await addParticipantLaunch.click();
  const participantAddRoute = page.locator(
    '.event-participant-add-route-modal[role="region"][aria-labelledby="event-modal-title"]'
  );
  await expect(participantAddRoute).toBeVisible();
  await expect(
    participantAddRoute.locator('[data-action="open-event-share"]')
  ).toBeVisible();
  await assertLayoutHealth(page, "participant add route");
  await participantAddRoute.locator('[data-action="open-event-share"]').click();
  const participantShareRoute = page.locator(
    '.event-share-modal[role="region"][aria-labelledby="event-modal-title"]'
  );
  await expect(participantShareRoute).toBeVisible();
  await assertLayoutHealth(page, "participant share route");
  await page.goBack();
  await expect(participantShareRoute).toBeHidden();
  await expect(participantAddRoute).toBeVisible();
  await page.goBack();
  await expect(participantAddRoute).toBeHidden();
  await expect(participantsRoute).toBeVisible();

  const connectedParticipantRow = participantsRoute.locator(
    `[data-action="open-event-participant-profile"][data-participant-id="${MAOR_ID}"]`
  );
  await connectedParticipantRow.click();
  const participantManagement = page.locator(
    '.event-participant-management-modal[role="region"][aria-labelledby="event-modal-title"]'
  );
  await expect(participantManagement).toBeVisible();
  await expect(participantManagement.locator('.event-participant-management-list')).toBeVisible();
  await expect(participantManagement.locator('[data-action="remove-event-participant"]')).toBeVisible();
  await expect(participantManagement.locator('.relationship-scorecard')).toHaveCount(0);
  await assertLayoutHealth(page, "participant management");

  const participantAdminToggle = participantManagement.locator(
    '[data-action="toggle-event-participant-admin"]'
  );
  await expect(participantAdminToggle).toBeEnabled();
  const participantAdminToggleSize = await participantAdminToggle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  expect(participantAdminToggleSize.width, "admin toggle keeps its compact width")
    .toBeLessThanOrEqual(52);
  expect(participantAdminToggleSize.height, "admin toggle must not stretch into the row")
    .toBeLessThanOrEqual(32);
  await participantAdminToggle.check();
  await expect(participantAdminToggle).toBeChecked();
  await expect(participantManagement.locator('.event-participant-notice')).toContainText(
    "הוגדר כמנהל אירוע"
  );

  if (process.env.CAPTURE_EVENT_PARTICIPANT_MANAGEMENT === "1") {
    await page.waitForTimeout(250);
    await page.screenshot({
      path: "design-audits/event-participant-management-current.png",
      fullPage: false
    });
  }

  await page.goBack();
  await expect(participantManagement).toBeHidden();
  await expect(participantsRoute).toBeVisible();
  await page.goBack();
  await expect(participantsRoute).toBeHidden();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT_ID}"]`))
    .toBeVisible();

  await page
    .locator(`[data-action="open-event-settings"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  const settingsDialog = page.locator(
    '.event-settings-modal[role="region"][aria-labelledby="event-modal-title"]'
  );
  await expect(settingsDialog).toBeVisible();
  await expect(page.locator(".event-action-dock")).toHaveCount(0);
  await assertLayoutHealth(page, "settings dialog");
  if (process.env.CAPTURE_EVENT_SETTINGS === "1") {
    await page.waitForTimeout(550);
    await page.screenshot({
      path: "design-audits/event-settings-current.png",
      fullPage: false
    });
  }
  await page.goBack();
  await expect(settingsDialog).toBeHidden();
  await expect(page.locator(`[data-screen-kind="event"][data-event-id="${EVENT_ID}"]`))
    .toBeVisible();

  const profileNavigation = page.locator(
    '.product-app-nav [data-nav-destination="profile"]'
  );
  const bottomNavLayer = await profileNavigation.evaluate((element) => {
    const stackingChain = (start) => {
      const chain = [];
      for (let current = start; current && chain.length < 8; current = current.parentElement) {
        const style = getComputedStyle(current);
        chain.push({
          tag: current.tagName,
          className: String(current.className || '').slice(0, 70),
          position: style.position,
          zIndex: style.zIndex,
          transform: style.transform,
          isolation: style.isolation
        });
      }
      return chain;
    };
    const rect = element.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    const nav = element.closest('.product-app-nav');
    return {
      hitInsideNavigation: Boolean(hitTarget?.closest('.product-app-nav') === nav),
      blocker: hitTarget?.outerHTML.slice(0, 180) || '',
      navigationZIndex: nav ? getComputedStyle(nav).zIndex : '',
      navigationChain: stackingChain(nav),
      blockerChain: stackingChain(hitTarget)
    };
  });
  expect(
    bottomNavLayer.hitInsideNavigation,
    `bottom navigation must stay above page content (${JSON.stringify(bottomNavLayer)})`
  ).toBe(true);
  await profileNavigation.click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  const avatarPickerShell = page.locator(".profile-avatar-picker-shell");
  if (await avatarPickerShell.count()) {
    await avatarPickerShell.locator(":scope > summary").click();
  }
  await expect(page.locator('.profile-avatar-option')).toHaveCount(6);
  const avatarPicker = await page.locator('.profile-avatar-options').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    visibleChoices: [...element.querySelectorAll('.profile-avatar-option')].filter((choice) => {
      const pickerRect = element.getBoundingClientRect();
      const choiceRect = choice.getBoundingClientRect();
      return choiceRect.left >= pickerRect.left - 1 && choiceRect.right <= pickerRect.right + 1;
    }).length
  }));
  expect(avatarPicker.visibleChoices, "all six avatar choices stay visible without swiping").toBe(6);
  expect(avatarPicker.scrollWidth, "the avatar picker must not hide choices off-screen")
    .toBeLessThanOrEqual(avatarPicker.clientWidth + 1);
  await assertLayoutHealth(page, "profile");

  if (process.env.CAPTURE_COHERENCE_ALL === "1") {
    await captureCoherenceScreen(page, "07-profile");

    await page.locator('[data-action="groups"]').first().click();
    await expect(page.locator('[data-screen-kind="groups"]')).toBeVisible();
    await assertLayoutHealth(page, "friends hub");
    await captureCoherenceScreen(page, "08-friends");

    await page
      .locator('.product-app-nav [data-nav-destination="notifications"]')
      .click();
    await expect(page.locator('[data-screen-kind="notifications"]')).toBeVisible();
    await expect(page.locator('.product-app-nav .product-nav-button:visible'))
      .toHaveCount(4);
    await expect.poll(async () => page.locator('.product-app-identity').evaluate((element) =>
      Math.round(element.getBoundingClientRect().top)
    ), { message: "notifications must open at the top of the screen" }).toBeGreaterThanOrEqual(0);
    await assertLayoutHealth(page, "notifications");
    await captureCoherenceScreen(page, "09-notifications");

    await page.locator('.product-app-nav [data-nav-destination="home"]').click();
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    await page.locator('[data-action="new-event"]').first().click();
    await expect(page.locator('[data-event-creation-step="type"]')).toBeVisible();
    await assertLayoutHealth(page, "new event type");
    await captureCoherenceScreen(page, "10-new-event-type");

    await page
      .locator('[data-action="new-event-type"][data-event-type="standard"]')
      .click();
    await expect(page.locator('[data-event-creation-step="details"]')).toBeVisible();
    await assertLayoutHealth(page, "new event details");
    await captureCoherenceScreen(page, "11-new-event-details");

    const newEventParticipants = page.locator(".new-event-participants");
    await newEventParticipants.locator(":scope > summary").click();
    await expect(newEventParticipants).toHaveAttribute("open", "");
    await assertLayoutHealth(page, "new event participants");
    await captureCoherenceScreen(page, "11b-new-event-participants");
  }
});

async function captureCoherenceScreen(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `design-audits/consistency-current/${name}.png`,
    fullPage: false
  });
}

async function assertCompactSettlementFirstView(page) {
  const layout = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height)
      };
    };

    return {
      viewportHeight: innerHeight,
      rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      heading: rectFor(".settlement-stage-heading"),
      firstTransfer: rectFor(".settlement-transfer-board .transfer-row"),
      bottomNavigation: rectFor(".product-app-nav"),
      screenPaddingBottom: parseFloat(
        getComputedStyle(document.querySelector(".settlement-screen")).paddingBottom
      ) || 0
    };
  });

  const extraLargeText = layout.rootFontSize >= 23;
  if (extraLargeText) {
    expect(layout.heading?.top, "large text keeps transfers close to the primary answer")
      .toBeLessThan(layout.viewportHeight * 1.5);
    expect(
      layout.firstTransfer?.top - layout.heading?.bottom,
      "large text must not introduce an empty block before the first transfer"
    ).toBeLessThanOrEqual(80);
  } else {
    expect(layout.heading?.top, "transfer heading stays in the document flow")
      .toBeLessThan(layout.viewportHeight * 1.5);
    const transfer = page.locator(".settlement-transfer-board .transfer-row").first();
    await transfer.scrollIntoViewIfNeeded();
    const reachableLayout = await page.evaluate(() => ({
      transferTop: Math.round(
        document.querySelector(".settlement-transfer-board .transfer-row")
          ?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      ),
      navigationTop: Math.round(
        document.querySelector(".product-app-nav")?.getBoundingClientRect().top ?? innerHeight
      )
    }));
    expect(reachableLayout.transferTop, "the first transfer must scroll above bottom navigation")
      .toBeLessThan(reachableLayout.navigationTop);
  }
  expect(layout.screenPaddingBottom, "summary content needs safe scroll space above bottom navigation")
    .toBeGreaterThanOrEqual(120);
}

async function assertSingleDecisionExpenseStep(page) {
  const dialog = page.locator(".expense-step-modal");
  const nav = page.locator(".event-route-primary-nav");
  await expect(nav).toBeVisible();
  await expect.poll(async () => {
    const rect = await dialog.evaluate((element) => element.getBoundingClientRect());
    return Math.round(rect.top);
  }, { message: "expense flow settles against the top edge" }).toBeLessThanOrEqual(4);
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const dialog = document.querySelector(".expense-step-modal");
      const nav = document.querySelector(".event-route-primary-nav");
      if (!dialog || !nav) return Number.POSITIVE_INFINITY;
      return Math.abs(
        Math.round(dialog.getBoundingClientRect().bottom) -
          Math.round(nav.getBoundingClientRect().top)
      );
    });
  }, { message: "expense flow reserves the bottom navigation area" }).toBeLessThanOrEqual(24);

  const actions = dialog.locator(".expense-modal-actions");
  await expect(actions).toBeVisible();
  await expect(actions).toBeInViewport();
  await expect(dialog.locator('[data-action="expense-step-next"]')).toBeInViewport();

  const layout = await dialog.evaluate((dialog) => {
    const visible = (element) => {
      const elementRect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        elementRect.width > 0 &&
        elementRect.height > 0
      );
    };

    return {
      step: dialog.dataset.expenseStep,
      visibleFields: [...dialog.querySelectorAll(
        'input:not([type="hidden"]), select, textarea'
      )].filter(visible).length
    };
  });

  expect(layout.step).toBe("amount");
  expect(layout.visibleFields, "each expense step asks for one decision at a time").toBe(1);
}

async function settleServiceWorkerBeforeReload(page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return;
    await Promise.race([
      navigator.serviceWorker.ready.catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
  });
}

async function assertExpenseStepStartsAtTop(page, step) {
  const dialog = page.locator(`.expense-step-modal[data-expense-step="${step}"]`);
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.locator(".expense-flow-body").evaluate(
    (element) => Math.round(element.scrollTop)
  ), { message: `${step}: expense step must reset its inner scroll position` }).toBe(0);

  const headerTop = await dialog.locator(".expense-modal-header").evaluate((element) =>
    Math.round(element.getBoundingClientRect().top)
  );
  expect(headerTop, `${step}: expense header must stay fully visible`).toBeGreaterThanOrEqual(0);
}

async function assertDocumentDirection(page) {
  await expect(page.locator("html")).toHaveAttribute("lang", "he-IL");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

async function assertLayoutHealth(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowingElements: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            element.closest("[inert]")
          ) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").slice(0, 100),
          text: String(element.textContent || "").trim().slice(0, 60)
        }))
    };
  });

  expect(
    overflow.scrollWidth,
    `${label}: document must not scroll horizontally (${JSON.stringify(overflow.overflowingElements)})`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const unnamedControls = await page.locator(
    'button:visible:not([aria-label]), a[href]:visible:not([aria-label]), input:visible:not([aria-label]):not([aria-labelledby]):not([type="hidden"])'
  ).evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          !element.labels?.length &&
          !String(element.textContent || element.value || "").trim()
      )
      .map((element) => element.outerHTML.slice(0, 180))
  );
  expect(unnamedControls, `${label}: every visible control needs an accessible name`).toEqual([]);

  const undersized = await page.locator(
    'button:visible:not(:disabled), a[href]:visible, input:visible, select:visible, summary:visible'
  ).evaluateAll((elements) =>
    elements
      .filter((element) => !element.closest("[inert]"))
      .map((element) => {
        const hitTarget =
          element instanceof HTMLInputElement && element.labels?.length
            ? element.labels[0]
            : element;
        const rect = hitTarget.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          name: String(
            element.getAttribute("aria-label") ||
            element.textContent ||
            element.getAttribute("name") ||
            ""
          ).trim().slice(0, 70)
        };
      })
      .filter(({ width, height }) => width > 0 && height > 0 && (width < 44 || height < 44))
  );
  expect(undersized, `${label}: active touch targets need a 44px hit area`).toEqual([]);

  const routeControlIssues = await page.locator(
    '.product-route-controls > :is(.app-back-button, .product-home-button, .accessibility-entry-button):visible'
  ).evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        name: element.getAttribute("aria-label") || element.textContent?.trim() || "route control",
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    })
    .filter(({ width, height }) => width > 56 || height > 56));
  expect(routeControlIssues, `${label}: fixed route controls must not cover screen content`)
    .toEqual([]);

  const coveredControls = await page.locator(
    'button:visible:not(:disabled), a[href]:visible, input:visible:not([type="hidden"]), select:visible, summary:visible'
  ).evaluateAll((elements) => {
    const bottomNavigation = document.querySelector(".product-app-nav");
    const bottomNavigationTop = bottomNavigation?.getBoundingClientRect().top ?? innerHeight;
    const eventWorkspaceNavigation = document.querySelector(".event-workspace-nav");
    const eventWorkspaceNavigationRect = eventWorkspaceNavigation?.getBoundingClientRect();
    const routeControls = document.querySelector(".product-route-controls");
    const routeControlsBottom = routeControls?.getBoundingClientRect().bottom ?? 0;
    const activeDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    return elements
    .filter((element) =>
      (!activeDialog || activeDialog.contains(element)) &&
      !element.inert &&
      !element.closest("[inert]")
    )
    .map((element) => {
      const hitTarget = element instanceof HTMLInputElement && element.labels?.length
        ? element.labels[0]
        : element;
      const rect = hitTarget.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      ) return null;
      if (!hitTarget.closest(".product-app-nav") && rect.bottom > bottomNavigationTop) {
        return null;
      }
      const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
      const blocker = document.elementFromPoint(x, y);
      if (
        blocker?.closest(".event-workspace-nav") &&
        eventWorkspaceNavigationRect &&
        rect.top < eventWorkspaceNavigationRect.bottom
      ) {
        return null;
      }
      if (blocker?.closest(".product-route-controls") && rect.top < routeControlsBottom) {
        return null;
      }
      const reachable = Boolean(
        blocker &&
        (hitTarget === blocker || hitTarget.contains(blocker) || blocker.closest("label") === hitTarget)
      );
      if (reachable) return null;
      return {
        name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 70) || "control",
        blocker: blocker?.getAttribute("aria-label") || blocker?.className || blocker?.tagName || "unknown"
      };
    })
    .filter(Boolean);
  });
  expect(coveredControls, `${label}: every visible control must remain tappable`).toEqual([]);
}

async function assertFocusedControlIsVisible(page) {
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    const rect = element?.getBoundingClientRect?.();
    return {
      tag: element?.tagName?.toLowerCase() || "",
      visible: Boolean(
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight
      )
    };
  });
  expect(focused.tag).toMatch(/input|button|select|textarea/);
  expect(focused.visible).toBe(true);
}
