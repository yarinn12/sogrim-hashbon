import { expect, test } from "@playwright/test";
import { installDelayedDialogFrameFixture } from "./helpers/noteEditorDiagnostics.mjs";

const OWNER_ID = "person-design-regression-owner";
const EVENT_ID = "event-design-regression";
const RESTAURANT_EVENT_ID = "event-design-regression-restaurant";

const seededState = {
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
  events: [
    {
      id: EVENT_ID,
      name: "אירוע בדיקת רגרסיה",
      eventType: "standard",
      currency: "ILS",
      participantIds: [OWNER_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-26T08:00:00.000Z",
      updatedAt: "2026-08-26T08:00:00.000Z",
      roundSettlementTransfers: true,
      directSettlementTransfers: false,
      locked: false,
      expenses: [],
      transfers: [],
      activityLog: []
    },
    {
      id: RESTAURANT_EVENT_ID,
      name: "מסעדת בדיקת רגרסיה",
      eventType: "restaurant",
      currency: "ILS",
      participantIds: [OWNER_ID],
      adminIds: [OWNER_ID],
      createdByParticipantId: OWNER_ID,
      createdAt: "2026-08-26T09:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z",
      roundSettlementTransfers: true,
      directSettlementTransfers: false,
      locked: false,
      expenses: [],
      transfers: [],
      activityLog: []
    }
  ],
  deletedEvents: [],
  deletedParticipants: []
};

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/reset");
  await request.put("/api/state", { data: seededState });
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
  }, { participantId: OWNER_ID, state: seededState });

  await page.goto("/");
  await expect(page.locator('#app .screen[data-screen-kind="home"]')).toBeVisible();
});

test("username editing never opens an empty action row", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("lang", "he-IL");
  await page.locator('.product-nav-button[data-nav-destination="profile"]').click();
  const usernameRow = page.locator('[data-profile-identity="username"]');
  const usernameValue = usernameRow.locator(".profile-identity-copy > strong");
  await usernameValue.locator("bdi").evaluate((element) => {
    element.textContent = `@${"very-long-username-".repeat(12)}`;
  });
  await expect(usernameValue).toHaveCSS("overflow", "hidden");
  await expect(usernameValue).toHaveCSS("white-space", "nowrap");
  await expect(usernameValue).toHaveCSS("text-overflow", "ellipsis");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );

  await usernameRow.locator('[data-action="edit-profile-username"]').click();

  await expect(usernameRow.locator(".profile-username-status")).toContainText(
    "זמינה אחרי חיבור לחשבון"
  );
  await expect(usernameRow.locator('[data-action="save-profile"]')).toHaveCount(0);
  await expect(
    usernameRow.locator('[data-action="cancel-profile-username-edit"]')
  ).toBeVisible();
});

test("expense templates preserve a custom name and still switch templates", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();

  const expenseDialog = page.locator('.expense-step-modal[role="dialog"]');
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.locator('[data-action="expense-step-next"]').click();
  await expect(expenseDialog).toHaveAttribute("data-expense-step", "name");

  const expenseName = page.locator('[data-action="expense-name"]');
  await expenseName.fill("ארוחת יום הולדת");
  await page.locator('[data-action="expense-template"][data-template="אוכל"]').click();
  await expect(expenseName).toHaveValue("ארוחת יום הולדת");

  await expenseName.fill("");
  await page.locator('[data-action="expense-template"][data-template="אוכל"]').click();
  await expect(expenseName).toHaveValue("אוכל");
  await page.locator('[data-action="expense-template"][data-template="שתייה"]').click();
  await expect(expenseName).toHaveValue("שתייה");
});

test("landscape expense templates keep full hit areas inside the form scroll", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator('[data-action="show-expense-form"]').first().click();
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.locator('[data-action="expense-step-next"]').click();
  const name = page.locator('[data-action="expense-name"]');
  const grid = page.locator(".expense-step-modal .expense-template-grid");
  for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => grid.evaluate(element => element.scrollHeight - element.clientHeight), {
      message: "the category grid must not become a clipped inner scroller"
    }).toBeLessThanOrEqual(1);
    const templates = grid.locator('[data-action="expense-template"]');
    for (const template of await templates.all()) {
      await name.fill("");
      const label = await template.getAttribute("data-template");
      // Normal click includes scrolling and hit testing. Never force it.
      try {
        await template.click({ timeout: 5000 });
      } catch (error) {
        await testInfo.attach("expense-template-hit-test", { contentType: "application/json", body: JSON.stringify(await template.evaluate(element => {
          const nodes = [];
          for (let node = element; node; node = node.parentElement) {
            const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
            nodes.push({ tag: node.tagName, className: node.className, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              scrollTop: node.scrollTop, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
              overflowY: css.overflowY, position: css.position, transform: css.transform, flex: css.flex });
          }
          return { viewport: { width: innerWidth, height: innerHeight }, nodes };
        })) });
        throw error;
      }
      await expect(name).toHaveValue(label);
    }
    await page.locator(".expense-flow-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
    // Reproduce the clipped category row seen in the audit: with the short
    // landscape form scrolled to its end, every category must retain its full
    // hit area below the progress header, including the first row.
    for (const template of await templates.all()) {
      const hitArea = await template.evaluate(element => {
        const box = element.getBoundingClientRect();
        const viewport = element.closest(".expense-flow-body").getBoundingClientRect();
        return { top: box.top - viewport.top, bottom: viewport.bottom - box.bottom,
          hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      });
      expect(hitArea.top).toBeGreaterThanOrEqual(-1);
      expect(hitArea.bottom).toBeGreaterThanOrEqual(-1);
      expect(hitArea.hit).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`expense-categories-${viewport.width}.png`) });
    await expect(page.locator('[data-action="expense-step-next"]')).toBeInViewport();
  }
});

test("a delayed expense step frame preserves the user's landscape scroll", async ({ page }) => {
  await installDelayedDialogFrameFixture(page, "expense-step-next");
  await page.reload();
  await page.setViewportSize({ width: 667, height: 375 });
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator('[data-action="show-expense-form"]').first().click();
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.evaluate(() => { window.__qaDelayNextNoteDialog = true; });
  await page.locator('[data-action="expense-step-next"]').click();
  const position = await page.evaluate(() => {
    const body = document.querySelector(".expense-flow-body");
    body.scrollTop = body.scrollHeight;
    const before = body.scrollTop;
    const frames = window.__qaFlushDialogFrames();
    return { before, after: body.scrollTop, frames };
  });
  expect(position.frames).toBeGreaterThan(0);
  expect(position.before).toBeGreaterThan(40);
  expect(position.after).toBe(position.before);
  const template = page.locator('[data-action="expense-template"]').last();
  const label = await template.getAttribute("data-template");
  await template.click();
  await expect(page.locator('[data-action="expense-name"]')).toHaveValue(label);
});

for (const destination of ["profile", "notifications"]) {
  test(`leaving an expense for ${destination} releases navigation and preserves the draft`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
    await page.locator('[data-action="show-expense-form"]').first().click();
    await page.locator('[data-action="expense-total"]').fill("123");
    await page.locator('[data-action="expense-step-next"]').click();
    await page.locator('[data-action="expense-name"]').fill("טיוטה שנשמרת במעבר מסך");
    await page.locator(`[data-nav-destination="${destination}"]:visible`).first().click();
    await expect(page.locator(`[data-screen-kind="${destination}"]`)).toBeVisible();
    await expect(page.locator("body")).not.toHaveClass(/app-dialog-open/);
    await expect(page.locator("[data-app-dialog-inert], [data-app-dialog-inert-container]")).toHaveCount(0);

    if (destination === "profile") {
      // History still owns its expense snapshot, not the unrelated destination.
      await page.goBack();
      await expect(page.locator(".expense-step-modal")).toBeVisible();
      await expect(page.locator('[data-action="expense-name"]')).toHaveValue("טיוטה שנשמרת במעבר מסך");
      await page.goForward();
      await expect(page.locator('[data-screen-kind="profile"]')).toBeVisible();
    } else {
      await page.locator('[data-nav-destination="profile"]:visible').first().click();
    }
    await page.locator('[data-action="groups"]').first().click();
    await expect(page.locator('[data-screen-kind="groups"]')).toBeVisible();
    const notifications = page.locator('[data-nav-destination="notifications"]:visible').first();
    await notifications.focus();
    await expect(notifications).toBeFocused();
    await notifications.press("Enter");
    await expect(page.locator('[data-screen-kind="notifications"]')).toBeVisible();
    await page.locator('[data-nav-destination="home"]:visible').first().click();
    await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
    await page.locator('[data-action="show-expense-form"]').first().click();
    await expect(page.locator('[data-action="expense-total"]')).toHaveValue("123");
    await page.locator('[data-action="expense-step-next"]').click();
    await expect(page.locator('[data-action="expense-name"]')).toHaveValue("טיוטה שנשמרת במעבר מסך");
    // Reopening a genuine expense dialog must still protect its background.
    await expect(page.locator("body")).toHaveClass(/app-dialog-open/);
    await expect.poll(() => page.locator("[data-app-dialog-inert]").count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test("a late expense template frame cannot redirect the user's next edit", async ({ page }) => {
  await installDelayedDialogFrameFixture(page, "expense-template");
  await page.reload();
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator(`[data-action="show-expense-form"][data-event-id="${EVENT_ID}"]`).first().click();
  await page.locator('[data-action="expense-total"]').fill("120");
  await page.locator('[data-action="expense-step-next"]').click();
  const name = page.locator('[data-action="expense-name"]');
  await name.fill("ארוחת יום הולדת");
  await page.evaluate(() => { window.__qaDelayNextNoteDialog = true; });
  await page.locator('[data-action="expense-template"][data-template="אוכל"]').click();
  const frames = await page.evaluate(() => {
    document.querySelector('[data-action="expense-name"]').focus();
    return window.__qaFlushDialogFrames();
  });
  expect(frames).toBeGreaterThan(0);
  await expect(name).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(name).toHaveValue("");
  await page.locator('[data-action="expense-template"][data-template="אוכל"]').click();
  await expect(name).toHaveValue("אוכל");
  await page.locator('[data-action="expense-template"][data-template="שתייה"]').click();
  await expect(name).toHaveValue("שתייה");
});

test("restaurant expense back and accessibility controls never overlap", async ({ page }) => {
  await page
    .locator(`[data-action="open-event"][data-event-id="${RESTAURANT_EVENT_ID}"]`)
    .first()
    .click();
  await page
    .locator(`[data-action="show-expense-form"][data-event-id="${RESTAURANT_EVENT_ID}"]`)
    .first()
    .click();
  await page.locator('[data-action="restaurant-split-mode"][data-mode="equal"]').click();

  const back = page.locator('.expense-modal-step-header [data-action="expense-step-back"]');
  const accessibility = page.locator('.expense-modal-step-header .expense-accessibility-button');
  await expect(back).toBeVisible();
  await expect(accessibility).toBeVisible();
  await expect(
    page.locator('.expense-modal-step-header [data-action="cancel-expense"]')
  ).toHaveCount(0);
  const [backBox, accessibilityBox] = await Promise.all([
    back.boundingBox(),
    accessibility.boundingBox()
  ]);
  expect(backBox).not.toBeNull();
  expect(accessibilityBox).not.toBeNull();
  const separated =
    backBox.x + backBox.width <= accessibilityBox.x ||
    accessibilityBox.x + accessibilityBox.width <= backBox.x;
  expect(separated, "back and accessibility controls must occupy separate header columns").toBe(true);
});

test("a failed share link stops loading and explains the unavailable action", async ({ page }) => {
  await page.locator(`[data-action="open-event"][data-event-id="${EVENT_ID}"]`).first().click();
  await page
    .locator(`[data-action="open-event-participant-add"][data-event-id="${EVENT_ID}"]`)
    .first()
    .click();
  await page.locator('[data-action="open-event-share"]').click();

  const shareDialog = page.locator(".event-share-modal");
  const shareStatus = shareDialog.locator(".event-share-link-status");
  const whatsappButton = shareDialog.locator('[data-action="share-invite-whatsapp"]');
  await expect(shareStatus).toHaveClass(/is-error/);
  await expect(shareStatus).toContainText("הקישור לא זמין");
  await expect(whatsappButton).toBeDisabled();
  await expect(whatsappButton).toHaveText("הקישור לא זמין");
  await expect(whatsappButton).not.toHaveAttribute("aria-busy", "true");
  await expect(shareDialog.locator('[data-action="retry-event-share"]')).toBeVisible();
});
