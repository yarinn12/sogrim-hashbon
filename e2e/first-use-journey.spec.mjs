import { expect, test } from "@playwright/test";

const OWNER_ID = "person-first-use-owner";
let runtimeIssues = [];

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

  await page.goto("/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
});

test.afterEach(() => {
  expect(runtimeIssues, "the first-use journey must not emit browser runtime errors").toEqual([]);
});

test("a new user completes the first useful loop without help", async ({ page }) => {
  await assertCriticalSemantics(page, "home");
  const newEventButton = page.locator('[data-action="new-event"]').first();
  await newEventButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-event-creation-step="type"]')).toBeVisible();
  await expect(page.locator('[data-event-creation-step="type"] h1')).toBeFocused();

  await page
    .locator('[data-action="new-event-type"][data-event-type="standard"]')
    .click();
  await expect(page.locator('[data-event-creation-step="details"]')).toBeVisible();
  await expect(page.locator('[data-action="new-event-name"]')).toBeFocused();
  const currencyPicker = page.locator(".new-event-inline-picker").filter({
    hasText: "מטבע האירוע"
  });
  await expect(currencyPicker.locator("summary")).toContainText("שקל ישראלי");
  await currencyPicker.locator("summary").click();
  await expect(
    currencyPicker.locator('[data-action="new-event-currency-choice"]')
  ).toHaveCount(29);
  await expect(
    currencyPicker.locator('[data-action="new-event-currency-choice"][data-choice-value="USD"]')
  ).toContainText("דולר אמריקאי");
  await expect(
    currencyPicker.locator('[data-action="new-event-currency-choice"][data-choice-value="JPY"]')
  ).toContainText("יפן");
  await currencyPicker
    .locator('[data-action="new-event-currency-choice"][data-choice-value="ILS"]')
    .click();
  await expect(currencyPicker.locator("summary")).toContainText("שקל ישראלי");

  await page.locator('[data-action="new-event-name"]').fill("ארוחת ערב");
  await page.locator('[data-action="open-new-event-settlement"]').click();
  await expect(page.locator('[data-event-creation-step="settlement"]')).toBeVisible();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await expect(page.locator('[data-event-creation-step="participants"]')).toBeVisible();
  await page
    .locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]')
    .click();
  await page.locator('[data-action="new-event-guest-name"]').fill("נועה כהן");
  await page.locator('[data-action="new-event-add-guest"]').click();
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");

  await page.locator('[data-action="create-event"]').click();
  const eventScreen = page.locator('[data-screen-kind="event"][data-event-id]:not([data-event-view="summary"])');
  await expect(eventScreen).toBeVisible();
  await expect(eventScreen.locator("h1")).toBeFocused();
  await expect(eventScreen).toContainText("ארוחת ערב");
  await assertNoHorizontalOverflow(page, "new event");
  await assertCriticalSemantics(page, "new event");

  const eventId = await eventScreen.getAttribute("data-event-id");
  expect(eventId).toBeTruthy();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`)
    .first()
    .click();

  const expenseDialog = page.locator('.expense-step-modal[role="dialog"]');
  await expect(expenseDialog).toHaveAttribute("data-expense-step", "amount");
  await expect(page.locator('[data-action="expense-total"]')).toBeFocused();
  const amountBodyBox = await expenseDialog.locator(".expense-flow-body").boundingBox();
  const amountFieldBox = await expenseDialog.locator(".expense-total-field").boundingBox();
  expect(amountBodyBox).toBeTruthy();
  expect(amountFieldBox).toBeTruthy();
  expect(amountFieldBox.y - amountBodyBox.y).toBeLessThan(110);
  await assertCriticalSemantics(page, "expense amount");
  await captureConsistencySurface(page, "12-expense-amount");
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.locator('[data-action="expense-step-next"]').click();

  await expect(expenseDialog).toHaveAttribute("data-expense-step", "name");
  await captureConsistencySurface(page, "13-expense-name");
  await page.locator('[data-action="expense-name"]').fill("פיצה");
  await page.locator('[data-action="expense-step-next"]').click();

  await expect(expenseDialog).toHaveAttribute("data-expense-step", "payer");
  await expect(page.locator('[data-action="expense-payer-amount"]').first()).toHaveValue(/120/);
  await captureConsistencySurface(page, "14-expense-payer");
  await page.locator('[data-action="expense-step-next"]').click();

  await expect(expenseDialog).toHaveAttribute("data-expense-step", "participants");
  await expect(page.locator('[data-action="expense-shared"]:checked')).toHaveCount(2);
  await captureConsistencySurface(page, "15-expense-participants");
  await expenseDialog.locator('[data-action="expense-open-participant-add"]').click();
  await expect(expenseDialog).toHaveAttribute("data-expense-participant-add-view", "menu");
  await captureConsistencySurface(page, "15b-expense-participant-add");
  await expect(expenseDialog.locator('[data-action="expense-share-invite"]')).toBeVisible();
  await expect(
    expenseDialog.locator('[data-action="expense-participant-add-view"][data-view="offline"]')
  ).toBeVisible();
  await expenseDialog
    .locator('[data-action="expense-participant-add-view"][data-view="offline"]')
    .click();
  await expect(expenseDialog).toHaveAttribute("data-expense-participant-add-view", "offline");
  await expect(expenseDialog.locator('[data-action="event-guest-name"]')).toBeFocused();
  await expenseDialog.locator('[data-action="expense-participant-add-back"]').click();
  await expect(expenseDialog).toHaveAttribute("data-expense-participant-add-view", "menu");
  await expenseDialog.locator('[data-action="expense-participant-add-back"]').click();
  await expect(expenseDialog).not.toHaveAttribute("data-expense-participant-add-view", /.+/);
  await page.locator('[data-action="expense-step-next"]').click();

  await expect(expenseDialog).toHaveAttribute("data-expense-step", "review");
  await expect(expenseDialog).toContainText("פיצה");
  await expect(expenseDialog).toContainText("120.00");
  await assertNoHorizontalOverflow(page, "expense review");
  await captureConsistencySurface(page, "16-expense-review");
  await page.locator('[data-action="save-expense"]').click();

  await expect(expenseDialog).toBeHidden();
  await expect(
    page.locator(`[data-action="show-expense-form"][data-event-id="${eventId}"]`).first()
  ).toBeFocused();
  await expect(eventScreen).toContainText("פיצה");
  await page.locator(`[data-action="settle"][data-event-id="${eventId}"]`).first().click();

  const settlement = page.locator(`[data-event-view="summary"][data-event-id="${eventId}"]`);
  await expect(settlement).toBeVisible();
  await expect(settlement).toContainText("נועה כהן");
  await expect(settlement).toContainText("60.00");
  const firstTransfer = settlement.locator(".settlement-transfer-board .transfer-row").first();
  await expect(firstTransfer).toBeVisible();
  await expect(firstTransfer.locator(".transfer-participant-name strong > bdi")).toHaveCount(2);
  await expect(firstTransfer.locator('.transfer-amount bdi[dir="ltr"] > span.font-num')).toHaveCount(1);
  await expect(settlement.locator(".settlement-hero")).toBeVisible();
  await expect(firstTransfer.locator('[data-action="mark-paid"]')).toHaveCount(0);
  await settlement.locator('[data-action="close-event"]').first().click();
  await settlement.locator('[data-action="confirm-close-event"]').click();
  await expect(
    firstTransfer.locator('[data-action="mark-paid"]')
  ).toBeVisible();
  await assertNoHorizontalOverflow(page, "first settlement");
  await assertCriticalSemantics(page, "first settlement");
  if (process.env.CAPTURE_SETTLEMENT_EXPLAINED === "1") {
    await page.screenshot({
      path: "design-audits/settlement-explained-current.png",
      fullPage: false
    });
  }

  // A closed event intentionally blocks adding participants. Reopen it before
  // exercising the invitation journey so this test follows the real product flow.
  await settlement.locator(".settlement-more-actions > summary").click();
  await settlement.locator('[data-action="reopen-event"]').click();
  await page.locator('[data-action="confirm-important-action"]').click();
  await expect(settlement.locator('[data-action="close-event"]').first()).toBeVisible();

  const shareButton = page
    .locator(`[data-action="open-event-participant-add"][data-event-id="${eventId}"]`)
    .first();
  await shareButton.focus();
  await page.keyboard.press("Enter");
  const participantAddRoute = page.locator(".event-participant-add-route-modal");
  await expect(participantAddRoute).toBeVisible();
  await participantAddRoute.locator('[data-action="open-event-share"]').click();
  const shareDialog = page.locator(".event-share-modal");
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toBeFocused();
  // Participant sharing intentionally skips the redundant choice screen and
  // opens the permanent link/QR route directly.
  await expect(shareDialog.locator('[data-event-share-view="link"]')).toBeVisible();
  // This isolated mobile fixture has no authenticated cloud. It must never
  // expose a locally reconstructed or unsigned invite while preparation is
  // unavailable; signed QR readiness is covered by the live invite gate.
  await expect(shareDialog.locator('[data-action="share-invite-whatsapp"]')).toBeDisabled();
  await expect(shareDialog.locator('[data-action="copy-invite"]')).toBeDisabled();
  await expect(shareDialog.locator('[data-share-ready="true"]')).toHaveCount(0);
  await assertNoHorizontalOverflow(page, "invite dialog");
  await assertCriticalSemantics(page, "invite dialog");
  await captureConsistencySurface(page, "17-event-invite-link");

  await page.keyboard.press("Escape");
  await expect(shareDialog).toBeHidden();
  await expect(participantAddRoute).toBeVisible();
});

test("currency picker stays stable across repeated WebKit-style reopen cycles", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  await page
    .locator('[data-action="new-event-type"][data-event-type="standard"]')
    .click();

  const picker = page.locator(".new-event-inline-picker").filter({ hasText: "מטבע האירוע" });
  const pickerTrigger = picker.locator("summary");

  for (let iteration = 0; iteration < 20; iteration += 1) {
    await pickerTrigger.click();
    await expect(
      picker.locator('[data-action="new-event-currency-choice"][data-choice-value="JPY"]')
    ).toBeVisible();
    await picker
      .locator('[data-action="new-event-currency-choice"][data-choice-value="ILS"]')
      .click();
    await expect(picker.locator("summary")).toContainText("שקל ישראלי");
  }
});

test("event creation keeps its draft when the user goes back to change the type", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  await page
    .locator('[data-action="new-event-type"][data-event-type="standard"]')
    .click();

  await page.locator('[data-action="new-event-name"]').fill("סוף שבוע בצפון");
  const currencyPicker = page.locator(".new-event-inline-picker").filter({ hasText: "מטבע האירוע" });
  await currencyPicker.locator("summary").click();
  await currencyPicker
    .locator('[data-action="new-event-currency-choice"][data-choice-value="EUR"]')
    .click();

  await page.locator('[data-action="open-new-event-settlement"]').click();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await page
    .locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]')
    .click();
  await page.locator('[data-action="new-event-guest-name"]').fill("נועה כהן");
  await page.locator('[data-action="new-event-add-guest"]').click();
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");

  await page.locator('[data-action="go-new-event-step"][data-new-event-step="type"]').click();
  await expect(page.locator('[data-event-creation-step="type"]')).toBeVisible();
  await page
    .locator('[data-action="new-event-type"][data-event-type="trip"]')
    .click();

  await expect(page.locator('[data-action="new-event-name"]')).toHaveValue(
    "סוף שבוע בצפון"
  );
  await expect(
    page.locator(".new-event-inline-picker").filter({ hasText: "מטבע האירוע" }).locator("summary")
  ).toContainText("אירו");
  await page.locator('[data-action="open-new-event-settlement"]').click();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");
});

test("a long saved-name list stays searchable while creating an event", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  await page
    .locator('[data-action="new-event-type"][data-event-type="standard"]')
    .click();
  await page.locator('[data-action="open-new-event-settlement"]').click();
  await page.locator('[data-action="open-new-event-participants"]').click();
  await page
    .locator('[data-action="set-new-event-participant-view"][data-participant-view="manual"]')
    .click();
  await expect(page.locator('[data-action="new-event-guest-name"]')).toBeFocused();

  for (let index = 1; index <= 16; index += 1) {
    const guestName = page.locator('[data-action="new-event-guest-name"]');
    await expect(guestName).toBeFocused();
    await guestName.pressSequentially(`חבר שמור ${index}`, { delay: 2 });
    await expect(guestName).toHaveValue(`חבר שמור ${index}`);
    await page.locator('[data-action="new-event-add-guest"]').click();
    await expect(guestName).toHaveValue("");
  }
  await page.evaluate(() => {
    window.__newEventParticipantHistorySettled = false;
    window.addEventListener("popstate", () => {
      window.__newEventParticipantHistorySettled = true;
    }, { once: true });
  });
  await page.locator('[data-action="close-new-event-participant-view"]').click();
  await expect.poll(
    () => page.evaluate(() => window.__newEventParticipantHistorySettled)
  ).toBe(true);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const friendsViewButton = page.locator(
    '[data-action="set-new-event-participant-view"][data-participant-view="friends"]'
  );
  await expect(friendsViewButton).toBeVisible();
  await friendsViewButton.focus();
  await expect(friendsViewButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.locator('[data-new-event-participant-subview="friends"]')
  ).toBeVisible();

  const participantSearch = page.locator(
    '[data-participant-search-for="new-event-participant"]'
  );
  await expect(participantSearch).toBeVisible();
  await participantSearch.pressSequentially("חבר שמור 16", { delay: 10 });
  await expect(participantSearch).toHaveValue("חבר שמור 16");
  await expect(
    page.locator(
      '[data-participant-checks-for="new-event-participant"] [data-participant-name]:visible'
    )
  ).toHaveCount(1);
});

test("friends hub exposes tabs without reporting profile as the current page", async ({ page }) => {
  await page.locator('.product-nav-button[data-nav-destination="profile"]').click();
  await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
  await page.locator('[data-action="groups"][data-tab="people"]').click();

  const friendsHub = page.locator('[data-screen-kind="groups"].friends-hub-screen');
  await expect(friendsHub).toBeVisible();
  await expect(friendsHub.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(friendsHub.locator('#friends-tab-people')).toHaveAttribute("aria-selected", "true");
  await expect(friendsHub.locator('.product-nav-button[aria-current="page"]')).toHaveCount(0);
});

async function assertShareRouteChoicesDoNotOverlap(shareDialog) {
  const layout = await shareDialog.evaluate((dialog) => {
    const choices = [...dialog.querySelectorAll(".event-share-route-choice")];
    if (choices.length !== 2) return null;
    const firstRect = choices[0].getBoundingClientRect();
    const secondRect = choices[1].getBoundingClientRect();
    return {
      firstBottom: firstRect.bottom,
      secondTop: secondRect.top,
      firstLeft: firstRect.left,
      firstRight: firstRect.right,
      secondLeft: secondRect.left,
      secondRight: secondRect.right
    };
  });

  expect(layout, "both share routes must render").not.toBeNull();
  expect(layout.secondTop, "the share routes must not overlap vertically").toBeGreaterThanOrEqual(layout.firstBottom - 1);
  expect(Math.abs(layout.firstLeft - layout.secondLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.firstRight - layout.secondRight)).toBeLessThanOrEqual(1);
}

async function captureConsistencySurface(page, name) {
  if (process.env.CAPTURE_COHERENCE_ALL !== "1") return;
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `design-audits/consistency-current/${name}.png`,
    fullPage: false
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(
    dimensions.scrollWidth,
    `${label}: the document must not scroll horizontally`
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertCriticalSemantics(page, label) {
  const issues = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        !element.hidden &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const referencedText = (element, attribute) =>
      String(element.getAttribute(attribute) ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
    const accessibleName = (element) =>
      String(element.getAttribute("aria-label") ?? "").trim() ||
      referencedText(element, "aria-labelledby") ||
      [...(element.labels ?? [])]
        .map((item) => item.textContent?.trim() ?? "")
        .join(" ")
        .trim() ||
      String(element.getAttribute("title") ?? "").trim() ||
      String(element.textContent ?? "").trim();
    const descriptor = (element) =>
      `${element.tagName.toLowerCase()}${element.dataset.action ? `[data-action="${element.dataset.action}"]` : ""}`;

    const unnamedControls = [...document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), select, textarea, summary'
    )]
      .filter(visible)
      .filter((element) => !accessibleName(element))
      .map((element) => `unnamed:${descriptor(element)}`);

    const idCounts = new Map();
    document.querySelectorAll("[id]").forEach((element) => {
      idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1);
    });
    const duplicateIds = [...idCounts]
      .filter(([, count]) => count > 1)
      .map(([id]) => `duplicate-id:#${id}`);

    const brokenReferences = [...document.querySelectorAll(
      "[aria-labelledby], [aria-describedby]"
    )].flatMap((element) =>
      ["aria-labelledby", "aria-describedby"].flatMap((attribute) =>
        String(element.getAttribute(attribute) ?? "")
          .trim()
          .split(/\s+/)
          .filter((id) => id && !document.getElementById(id))
          .map((id) => `broken-${attribute}:${descriptor(element)}->#${id}`)
      )
    );

    return [...unnamedControls, ...duplicateIds, ...brokenReferences];
  });

  expect(issues, `${label}: visible controls and ARIA references must be valid`).toEqual([]);
}
