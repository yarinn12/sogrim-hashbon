import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createAppHandler } from "../server.mjs";

const owner = "draft-owner", eventId = "draft-event";
const timestamp = "2026-09-01T00:00:00.000Z";
const fixture = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: "בודק טיוטות", kind: "user" }],
  groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [],
  events: [{ id: eventId, name: "שחזור אחרי עדכון", eventType: "outing", currency: "ILS",
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: timestamp, updatedAt: timestamp,
    expenses: [{ id: "draft-expense", name: "הוצאה מקורית", total: 12000,
      payers: [{ participantId: owner, amount: 12000 }], sharedByParticipantIds: [owner],
      createdByParticipantId: owner, updatedAt: timestamp }],
    notes: [{ id: "draft-note", title: "כותרת מקורית", body: "תוכן מקורי", pinned: false,
      createdByParticipantId: owner, updatedByParticipantId: owner, createdAt: timestamp, updatedAt: timestamp }],
    transfers: [], deletedNotes: [], activityLog: [] }]
};

for (const kind of ["new note", "edited note", "edited expense"]) {
  test(`an actual service worker update preserves an unsaved ${kind}`, async ({ page }) => {
    const folder = await mkdtemp(join(tmpdir(), "sogrim-pwa-draft-"));
    const stateFile = join(folder, "state.json");
    await writeFile(stateFile, JSON.stringify(fixture));
    const worker = await readFile("sw.js", "utf8");
    const release = worker.match(/const PWA_RELEASE = "(\d+)"/)[1];
    let update = false;
    const app = createAppHandler({ root: process.cwd(), env: {}, stateFile, serverErrorLogger: () => {} });
    const server = createServer((request, response) => {
      if (new URL(request.url, "http://localhost").pathname === "/sw.js") {
        response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
        response.end(update ? worker : worker.replaceAll(release, String(Number(release) - 1)));
      } else app(request, response);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.addInitScript(state => {
        if (localStorage.getItem("qa-draft-seeded")) return;
        localStorage.setItem("qa-draft-seeded", "1");
        localStorage.setItem("settle-friends-state", JSON.stringify(state));
        localStorage.setItem("settle-friends-current-participant", state.currentParticipantId);
        localStorage.setItem("settle-friends-local-profile", JSON.stringify({
          participantId: state.currentParticipantId, displayName: "בודק טיוטות"
        }));
        sessionStorage.setItem("settle-friends-skip-next-splash", "1");
      }, fixture);
      await page.goto(origin);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      // This visit starts with an active controller, exercising the real page's
      // controllerchange handler as well as the worker's client.navigate path.
      await page.reload();
      await openEditor(page, kind);
      const field = page.locator(`[data-action="${kind === "edited expense" ? "expense-name" : "event-note-body"}"]`);
      const text = `טיוטה שלא נשמרה ${kind}`;
      await field.fill(text);
      if (kind !== "edited expense") {
        await page.locator('[data-action="event-note-title"]').fill("כותרת הטיוטה");
        await page.locator('[data-action="toggle-event-note-pin"]').click();
      }
      update = true;
      const navigation = page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() });
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
      await navigation;
      await openEditor(page, kind);
      await expect(field).toHaveValue(text);
      if (kind !== "edited expense") {
        await expect(page.locator('[data-action="event-note-title"]')).toHaveValue("כותרת הטיוטה");
        await expect(page.locator('[data-action="toggle-event-note-pin"]')).toHaveAttribute("aria-pressed", "true");
        // Restoring an editor must not publish the unsaved draft.
        // This isolated fixture uses local mode. Its actual durable write is
        // localStorage (the dev server's state file is not this client's store).
        const beforeSave = await persistedClientState(page);
        expect(beforeSave.events[0].notes.map(({ id, body }) => ({ id, body })))
          .toEqual(fixture.events[0].notes.map(({ id, body }) => ({ id, body })));
        await page.locator('[data-action="save-event-note"]').click();
        await expect(page.locator(".event-note-modal")).toHaveCount(0);
        await expect.poll(async () => {
          const saved = await persistedClientState(page);
          return saved.events[0].notes.filter(note => note.body === text).length;
        }).toBe(1);
        await page.reload();
        await openEditor(page, "new note");
        await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("");
      } else {
        expect((await persistedClientState(page)).events[0].expenses[0].name).toBe("הוצאה מקורית");
        for (let step = 0; step < 4 && !(await page.locator('[data-action="save-expense"]').isVisible()); step++) {
          await page.locator('[data-action="expense-step-next"]').click();
        }
        await page.locator('[data-action="save-expense"]').click();
        await expect(page.locator(".expense-modal")).toHaveCount(0);
        expect((await persistedClientState(page)).events[0].expenses[0].name).toBe(text);
        expect(await page.evaluate(() => localStorage.getItem("settle-friends-expense-draft:draft-owner:draft-event:edit:draft-expense"))).toBeNull();
        await page.reload();
        await openEditor(page, kind);
        await expect(field).toHaveValue(text);
      }
      expect(errors).toEqual([]);
    } finally {
      await page.goto("about:blank").catch(() => {});
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await rm(folder, { recursive: true, force: true });
    }
  });
}

async function persistedClientState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("settle-friends-state")));
}

async function openEditor(page, kind) {
  await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
  await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
  if (kind === "edited expense") {
    const row = page.locator('.expense-row[data-expense-id="draft-expense"]');
    await row.locator(".expense-row-actions-menu > summary").click();
    await row.locator('[data-action="edit-expense"]').click();
    // Recovery may retain the selected step, or reopen its review.
    if (await page.locator('[data-action="expense-step-edit"][data-step="name"]').isVisible()) {
      await page.locator('[data-action="expense-step-edit"][data-step="name"]').click();
    }
  } else {
    await page.locator('[data-action="open-event-notes"]').click();
    await page.locator(kind === "new note" ? '[data-action="new-event-note"]'
      : '.event-note-row[data-action="open-event-note"][data-note-id="draft-note"]').click();
  }
}
