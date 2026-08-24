import { expect, test } from "@playwright/test";

import { calculateSettlement } from "../src/domain/settlement.mjs";

const EVENT_ID = "event-layout-ci";
const OWNER_ID = "person-owner";
const MAOR_ID = "account-12345678-1234-4123-8123-123456789abc";
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
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      runtimeIssues.push(`console: ${message.text()}`);
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

test("offline mode keeps shared event data read-only until sync access returns", async ({
  page,
  context
}) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
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
  await expect(page.locator("[data-sync-status]")).toContainText(
    "אין רשת כרגע"
  );
  await expect(adminToggle).toHaveAttribute("aria-disabled", "true");
  await adminToggle.click({ force: true });
  await expect(adminToggle).not.toBeChecked();

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
  await reconnectedAdminToggle.check();
  await expect(reconnectedAdminToggle).toBeChecked();
});

test("routine background sync never opens a sync surface", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
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

test("expense notes save and close smoothly", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const expense = page.locator('[data-expense-id="expense-taxi"]');
  await expense.locator(".expense-row-actions-menu summary").click();
  await expense.locator('[data-action="edit-expense-notes"]').click();

  const dialog = page.locator(".expense-notes-modal");
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-action="expense-notes"]').fill("איסוף מטרמינל שלוש");
  await dialog.locator('[data-action="save-expense"]').click();

  await expect(dialog).toBeHidden();
  await expense.locator('[data-action="toggle-expense-participants"]').click();
  await expect(expense.locator(".expense-saved-notes")).toHaveText(
    "איסוף מטרמינל שלוש"
  );
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

  await page
    .locator(`[data-action="settle"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await expect(page.locator('[data-event-view="summary"]')).toBeVisible();
  await expect(page.locator(".event-workspace-nav")).toBeVisible();
  await assertLayoutHealth(page, "event summary");
  await assertCompactSettlementFirstView(page);

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
    expect(layout.heading?.top, "transfer heading must begin in the first viewport")
      .toBeLessThan(layout.bottomNavigation?.top ?? layout.viewportHeight);
    expect(layout.firstTransfer?.top, "the first transfer must begin before bottom navigation")
      .toBeLessThan(layout.bottomNavigation?.top ?? layout.viewportHeight);
  }
  expect(layout.screenPaddingBottom, "summary content needs safe scroll space above bottom navigation")
    .toBeGreaterThanOrEqual(120);
}

async function assertSingleDecisionExpenseStep(page) {
  const dialog = page.locator(".expense-step-modal");
  await expect.poll(async () => {
    const rect = await dialog.evaluate((element) => element.getBoundingClientRect());
    return Math.round(rect.top);
  }, { message: "expense flow settles against the top edge" }).toBeLessThanOrEqual(4);
  await expect.poll(async () => {
    const rect = await dialog.evaluate((element) => element.getBoundingClientRect());
    return Math.round(rect.bottom);
  }, { message: "expense flow settles against the bottom edge" }).toBeGreaterThanOrEqual(
    await page.evaluate(() => innerHeight - 4)
  );

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
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
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
