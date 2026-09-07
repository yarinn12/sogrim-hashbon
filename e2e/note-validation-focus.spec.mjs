import { expect, test } from "@playwright/test";
import { installDelayedDialogFrameFixture } from "./helpers/noteEditorDiagnostics.mjs";

test.use({ serviceWorkers: "block" });

test("validation feedback cannot redirect continued note typing into the wrong field", async ({ page, request }) => {
  const owner = "person-validation-owner", eventId = "event-validation-focus";
  const state = {
    currentParticipantId: owner,
    participants: [{ id: owner, displayName: "בודק מקומי", kind: "user", avatarPreset: "avatar-1" }],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{ id: eventId, name: "בדיקת טיוטה", eventType: "outing", currency: "ILS",
      participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
      createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z",
      expenses: [], transfers: [], notes: [], activityLog: [] }]
  };
  await request.post("/api/reset");
  await request.put("/api/state", { data: state });
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-state", JSON.stringify(state));
    localStorage.setItem("settle-friends-current-participant", owner);
    localStorage.setItem("settle-friends-local-profile", JSON.stringify({
      participantId: owner, displayName: "בודק מקומי", avatarPreset: "avatar-1"
    }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { state, owner });
  await installDelayedDialogFrameFixture(page, "save-event-note");
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.goto("/");
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  await page.locator('[data-action="open-event-notes"]').click();
  await page.locator('[data-action="new-event-note"]').click();
  await page.evaluate(() => { window.__qaDelayNextNoteDialog = true; });
  await page.locator('[data-action="save-event-note"]').click();
  await expect(page.locator(".event-note-modal")).toContainText("צריך לכתוב כותרת או תוכן");
  const frames = await page.evaluate(() => {
    document.querySelector('[data-action="event-note-body"]').focus();
    return window.__qaFlushDialogFrames();
  });
  expect(frames).toBeGreaterThan(0);
  // Do not use fill(): it refocuses the field and masks the late-focus bug.
  await page.keyboard.insertText("התוכן נשאר בשדה שבחרתי");
  await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("התוכן נשאר בשדה שבחרתי");
  await expect(page.locator('[data-action="event-note-title"]')).toHaveValue("");
  await page.locator('[data-action="save-event-note"]').click();
  await expect(page.locator(".event-note-modal")).toHaveCount(0);
  await expect(page.locator(".event-note-open")).toHaveCount(1);
  await expect(page.locator(".event-note-open")).toContainText("התוכן נשאר בשדה שבחרתי");
  const notes = await page.evaluate(eventId => JSON.parse(localStorage.getItem("settle-friends-state"))
    .events.find(event => event.id === eventId).notes, eventId);
  expect(notes).toHaveLength(1);
  expect(notes[0].body).toBe("התוכן נשאר בשדה שבחרתי");
  expect(notes[0].title).toBe("");
  expect(runtimeErrors).toEqual([]);
});
