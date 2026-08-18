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
  const currencySelect = page.locator('[data-action="new-event-currency"]');
  await expect(currencySelect).toHaveValue("ILS");
  await expect(currencySelect.locator("option")).toHaveCount(29);
  await expect(currencySelect.locator('option[value="USD"]')).toHaveText(
    "דולר אמריקאי (ארצות הברית) · $"
  );
  await expect(currencySelect.locator('option[value="JPY"]')).toHaveText(
    "ין (יפן) · ¥"
  );
  await page
    .locator('[data-choice-select-action="new-event-currency"]')
    .click();
  const currencySearch = page.locator(".app-choice-search-input");
  await expect(currencySearch).toBeVisible();
  await currencySearch.fill("יפן");
  await expect(
    page.locator(".app-choice-option:not([hidden])")
  ).toHaveCount(1);
  await expect(
    page.locator('.app-choice-option[data-choice-value="JPY"]')
  ).toContainText("יפן");
  await currencySearch.fill("JPY");
  await expect(
    page.locator('.app-choice-option[data-choice-value="JPY"]')
  ).toBeVisible();
  await currencySearch.fill("מדינה שלא קיימת");
  await expect(page.locator(".app-choice-search-empty")).toBeVisible();
  await currencySearch.fill("");
  await page
    .locator('.app-choice-option[data-choice-value="ILS"]')
    .click();
  await expect(currencySelect).toHaveValue("ILS");

  await page.locator('[data-action="new-event-name"]').fill("ארוחת ערב");
  await page.locator(".new-event-participants > summary").click();
  await page.locator('[data-action="new-event-guest-name"]').fill("נועה כהן");
  await page.locator('[data-action="new-event-add-guest"]').click();
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
  await expect(settlement.locator(".settlement-hero")).toBeVisible();
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

  const shareButton = page
    .locator(`[data-action="open-event-share"][data-event-id="${eventId}"]`)
    .first();
  await shareButton.focus();
  await page.keyboard.press("Enter");
  const shareDialog = page.locator('.event-modal[role="dialog"]');
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toBeFocused();
  const shareMenu = shareDialog.locator('[data-event-share-view="menu"]');
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu.locator('[data-action="event-share-view"]')).toHaveCount(2);
  await expect(shareDialog.locator('[data-action="share-invite-whatsapp"]')).toHaveCount(0);
  await expect(shareDialog.locator('[data-action="copy-invite"]')).toHaveCount(0);
  await assertShareRouteChoicesDoNotOverlap(shareDialog);
  await captureConsistencySurface(page, "17-event-invite");

  await shareMenu.locator('[data-share-view="link"]').click();
  await expect(shareDialog.locator('[data-event-share-view="link"]')).toBeVisible();
  await expect(shareDialog.locator('[data-action="share-invite-whatsapp"]')).toBeEnabled();
  await expect(shareDialog.locator('[data-action="copy-invite"]')).toBeEnabled();
  await expect(shareDialog.locator('[data-share-ready="true"]')).toHaveCount(1);
  await expect(shareDialog.locator(".event-invite-link-preview")).toContainText(
    "קישור ההזמנה מוכן"
  );
  const inviteQr = shareDialog.locator("details.public-invite-qr");
  await expect(inviteQr).not.toHaveAttribute("open", "");
  await inviteQr.locator("summary").click();
  await expect(inviteQr).toHaveAttribute("open", "");
  await expect(inviteQr.locator(".public-invite-qr-code svg")).toBeVisible();
  await inviteQr.locator("summary").click();
  await expect(inviteQr).not.toHaveAttribute("open", "");
  await assertNoHorizontalOverflow(page, "invite dialog");
  await assertCriticalSemantics(page, "invite dialog");
  await captureConsistencySurface(page, "17-event-invite-link");

  await page.keyboard.press("Escape");
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu.locator('[data-share-view="link"]')).toBeFocused();
  await shareMenu.locator('[data-share-view="friends"]').click();
  await expect(shareDialog.locator('[data-event-share-view="friends"]')).toBeVisible();
  await expect(shareDialog.locator('[data-action="copy-invite"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu.locator('[data-share-view="friends"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(shareDialog).toBeHidden();
  await expect(shareButton).toBeFocused();
});

test("event creation keeps its draft when the user goes back to change the type", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  await page
    .locator('[data-action="new-event-type"][data-event-type="standard"]')
    .click();

  await page.locator('[data-action="new-event-name"]').fill("סוף שבוע בצפון");
  await page
    .locator('[data-choice-select-action="new-event-currency"]')
    .click();
  await page
    .locator('.app-choice-option[data-choice-value="EUR"]')
    .click();

  await page.locator(".new-event-participants > summary").click();
  await page.locator('[data-action="new-event-guest-name"]').fill("נועה כהן");
  await page.locator('[data-action="new-event-add-guest"]').click();
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");

  await page.locator('[data-action="go-back"]').first().click();
  await expect(page.locator('[data-event-creation-step="type"]')).toBeVisible();
  await page
    .locator('[data-action="new-event-type"][data-event-type="trip"]')
    .click();

  await expect(page.locator('[data-action="new-event-name"]')).toHaveValue(
    "סוף שבוע בצפון"
  );
  await expect(page.locator('[data-action="new-event-currency"]')).toHaveValue("EUR");
  await expect(page.locator("[data-new-event-participant-count]")).toContainText("2");
  await expect(page.locator(".new-event-participants")).not.toHaveAttribute("open", "");
});

test("a long saved-name list stays searchable while creating an event", async ({ page }) => {
  await page.locator('[data-action="new-event"]').first().click();
  await page
    .locator('[data-action="new-event-type"][data-event-type="standard"]')
    .click();
  await page.locator(".new-event-participants > summary").click();

  for (let index = 1; index <= 16; index += 1) {
    await page
      .locator('[data-action="new-event-guest-name"]')
      .fill(`חבר שמור ${index}`);
    await page.locator('[data-action="new-event-add-guest"]').click();
  }

  const participantSearch = page.locator(
    '[data-participant-search-for="new-event-participant"]'
  );
  await expect(participantSearch).toBeVisible();
  await participantSearch.fill("חבר שמור 16");
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
