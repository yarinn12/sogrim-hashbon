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
  await expect(settlement.locator(".settlement-hero")).toHaveCount(0);
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
  await expect(shareDialog.locator('[data-action="share-invite-whatsapp"]')).toBeEnabled();
  await expect(shareDialog.locator('[data-action="copy-invite"]')).toBeEnabled();
  await expect(shareDialog.locator('[data-share-ready="true"]')).toHaveCount(1);
  await assertNoHorizontalOverflow(page, "invite dialog");
  await assertCriticalSemantics(page, "invite dialog");
  await captureConsistencySurface(page, "17-event-invite");
  await page.keyboard.press("Escape");
  await expect(shareDialog).toBeHidden();
  await expect(shareButton).toBeFocused();
});

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
