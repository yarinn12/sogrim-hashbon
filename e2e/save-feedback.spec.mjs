import { expect, test } from "@playwright/test";
import { updateEventNote, removeEventNote } from "../src/domain/eventNotes.mjs";
import { isWebKitReloadDiagnostic } from "./helpers/reloadDiagnostics.mjs";
test.use({ serviceWorkers: "block" });
// Synthetic backend only: actual app controls, local durable outbox and status UI.
for (const { status, restart = false } of [
  ...[403, 503, "partial-create", "partial-edit", "partial-delete"].map(status => ({ status })),
  ...[503, "partial-create", "partial-edit", "partial-delete"].map(status => ({ status, restart: true })),
  ...["receipt-edit", "receipt-delete", "pending-next-fails", "pending-next-recovers"].map(status => ({ status }))
]) {
const partialRetry = String(status).startsWith("partial-");
const deleteRetry = status === "partial-delete";
const receiptConflict = String(status).startsWith("receipt-");
const pendingFollowup = String(status).startsWith("pending-next-");
test(pendingFollowup ? `note ${status} keeps earlier pending work covered by the next event save` : receiptConflict ? `new note ${status} conflict keeps the published identity on retry` : restart ? `note ${status} survives restart during outage and recovers automatically` : partialRetry ? `note ${status} retry confirms one note without duplication` : `note save feedback handles HTTP ${status} without false offline alerts`, async ({ page, browserName }, testInfo) => {
  let writeStatus = 200, canonicalAttempts = 0;
  let competingNoteId = "";
  const origin = "https://egress-cache-test.supabase.co";
  const userId = "egress-cache-user";
  const participantId = `account-${userId}`;
  const spaceId = "egress-cache-account";
  const sharedId = "egress-cache-shared";
  const spaceKey = "abcdefghijklmnopqrstuvwxyz_123456";
  const eventId = "egress-cache-event";
  const secondEventId = `${eventId}-second`;
  const secondSharedId = `${sharedId}-second`;
  const initialVersion = "2026-09-04T08:00:00.000Z";
  const user = {
    id: userId, email: "egress-cache@example.com",
    app_metadata: { provider: "google" },
    user_metadata: {
      full_name: "בדיקת סנכרון", username: "egress_cache_user",
      account_space_id: spaceId, account_space_key: spaceKey
    }
  };
  const initialState = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "בדיקת סנכרון", kind: "user",
      accountLinked: true, avatarPreset: "avatar-1" }],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{
      id: eventId, name: "פתקים בסנכרון חסכוני", eventType: "outing", currency: "ILS",
      participantIds: [participantId], adminIds: [participantId],
      createdByParticipantId: participantId, createdAt: initialVersion,
      updatedAt: initialVersion, statusUpdatedAt: initialVersion,
      sharedSpaceId: sharedId, sharedSpaceKey: spaceKey,
      roundSettlementTransfers: false, expenses: [], transfers: [], activityLog: [],
      notes: [{ id: "cache-sync-note", title: "פתק ראשון", body: "נשמר בענן",
        pinned: false, createdByParticipantId: participantId,
        updatedByParticipantId: participantId, createdAt: initialVersion,
        updatedAt: initialVersion }]
    }]
  };
  if (receiptConflict) {
    initialState.participants.push({ id: "account-concurrent-peer", displayName: "משתתף נוסף", kind: "user", accountLinked: true });
    initialState.events[0].participantIds.push("account-concurrent-peer");
  }
  if (pendingFollowup) {
    initialState.events.push({ ...structuredClone(initialState.events[0]),
      id: secondEventId, name: "אירוע שני", sharedSpaceId: secondSharedId, notes: [] });
  }
  let personal = { id: spaceId, state: structuredClone(initialState), updated_at: initialVersion };
  const shared = { id: sharedId, state: structuredClone(initialState), updated_at: initialVersion };
  shared.state.events = [shared.state.events[0]];
  const secondShared = pendingFollowup ? {
    id: secondSharedId, state: { ...structuredClone(initialState), events: [structuredClone(initialState.events[1])] },
    updated_at: initialVersion
  } : null;
  const reads = [];
  const errors = [];
  const reloadDiagnostics = [];
  let reloading = false;
  page.on("pageerror", (error) => {
    if (isWebKitReloadDiagnostic(error, { browserName, reloading, origin })) reloadDiagnostics.push(error.stack);
    else errors.push(error.message);
  });
  // Preserve independent checks for real window errors and unhandled promise
  // rejections, including throughout the document-replacement interval.
  await page.exposeBinding("qaReportApplicationError", (_, message) => errors.push(message));
  await page.addInitScript(() => {
    addEventListener("error", event => {
      if (event.message) window.qaReportApplicationError(event.message).catch(() => {});
    });
    addEventListener("unhandledrejection", event => {
      window.qaReportApplicationError(String(event.reason?.stack ?? event.reason)).catch(() => {});
    });
  });
  const reloadPage = async () => {
    reloading = true;
    try { await page.reload({ waitUntil: "commit" }); }
    finally { reloading = false; }
    await page.waitForLoadState("load");
  };
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-space-key",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(testInfo.project.use.baseURL).origin ? route.continue() : route.abort());
  await page.route("**/api/config", (route) => route.fulfill({ json: {
    publicUrl: testInfo.project.use.baseURL,
    storage: { mode: "supabase", url: origin, anonKey: "test-anon-key", table: "app_snapshots" }
  } }));
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (json, extra = {}) => route.fulfill({ headers, json, ...extra });
    if (request.method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname.endsWith("/rpc/ensure_account_workspace")) {
      return reply({ status: "existing", workspaceId: spaceId });
    }
    if (url.pathname.endsWith("/rpc/join_shared_event")) return reply(true);
    if (url.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
      const payload = request.postDataJSON();
      const writtenEvent = payload.p_state.events[0];
      const target = pendingFollowup && payload.p_snapshot_id === secondSharedId ? secondShared : shared;
      if (deleteRetry ? writtenEvent?.deletedNotes?.some(note => note.id === "cache-sync-note")
        : writtenEvent?.notes?.some(note => note.body === "טיוטה שלא תאבד")) canonicalAttempts++;
      // One canonical commit followed by a failed personal write and rejected
      // immediate canonical retry creates genuine partial progress in the store.
      if (writeStatus === "partial") {
        if (canonicalAttempts > 1) return reply({ message: "Synthetic later rejection" }, { status: 403 });
      } else if (writeStatus !== 200 && target !== secondShared) return reply({ message: "Synthetic rejection" }, { status: writeStatus });
      target.state = payload.p_state;
      target.updated_at = new Date().toISOString();
      return reply({ status: "updated", updatedAt: target.updated_at });
    }
    if (url.pathname.endsWith("/app_snapshots")) {
      if (request.method() === "GET") {
        const fields = (url.searchParams.get("select") || "id,state,updated_at").split(",");
        const isIndex = url.searchParams.has("snapshot_kind");
        const row = url.searchParams.get("id") === `eq.${sharedId}` ? shared
          : secondShared && url.searchParams.get("id") === `eq.${secondSharedId}` ? secondShared : personal;
        const selectedRows = isIndex ? [shared, ...(secondShared ? [secondShared] : [])] : [row];
        const rows = selectedRows.map(row => Object.fromEntries(fields.map((field) => [field, row[field]])));
        reads.push({ kind: isIndex ? "index" : row.id, fields, version: row.updated_at });
        return reply(rows, { headers: { ...headers, "content-range": `0-${rows.length - 1}/${rows.length}` } });
      }
      const body = request.postDataJSON();
      if (receiptConflict && canonicalAttempts > 0 && !competingNoteId) {
        // The new note is already canonical and visible to another member,
        // while the creator still awaits personal persistence. Simulate that
        // member's edit/deletion before a transient failure forces a reread.
        competingNoteId = shared.state.events[0].notes.find(note => note.body === "טיוטה שלא תאבד").id;
        const changedAt = new Date(Date.now() + 1_000).toISOString();
        shared.state = status === "receipt-delete"
          ? removeEventNote(shared.state, eventId, competingNoteId, { participantId: "account-concurrent-peer", deletedAt: changedAt })
          : updateEventNote(shared.state, eventId, competingNoteId, { participantId: "account-concurrent-peer", body: "שינוי מהמכשיר השני", updatedAt: changedAt });
        shared.updated_at = changedAt;
        personal = { ...personal, state: structuredClone(shared.state), updated_at: changedAt };
        return reply({ message: "Synthetic personal response lost after peer update" }, { status: 503 });
      }
      if (writeStatus === "partial" && canonicalAttempts > 0) {
        return reply({ message: "Synthetic personal outage" }, { status: 503 });
      }
      if (body?.state && url.searchParams.get("id") !== `eq.${sharedId}`) {
        personal = { ...personal, state: body.state, updated_at: body.updated_at || new Date().toISOString() };
      }
      return reply([{ updated_at: personal.updated_at }]);
    }
    if (url.pathname.endsWith("/user_profiles")) {
      const profile = {
        user_id: userId, username: "egress_cache_user", username_customized: false,
        display_name: "בדיקת סנכרון", avatar_preset: "avatar-1", avatar_image: null,
        avatar_image_updated_at: null, updated_at: initialVersion
      };
      const fields = (url.searchParams.get("select") || Object.keys(profile).join(",")).split(",");
      return reply([Object.fromEntries(fields.map((field) => [field, profile[field]]))]);
    }
    if (request.method() === "GET") return reply([]);
    return route.fulfill({ headers, status: 204 });
  });
  await page.addInitScript(({ user, state, spaceId, spaceKey }) => {
    // Seed this isolated browser once; restarting must exercise the app's own
    // durable snapshot/outbox, not silently reset it to the fixture.
    if (localStorage.getItem("qa-note-save-seeded")) return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("settle-friends-account-session", JSON.stringify({
      access_token: "cache-test-token", refresh_token: "cache-test-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600, user
    }));
    localStorage.setItem(`settle-friends-local-profile:account:${encodeURIComponent(user.id)}`,
      JSON.stringify({ participantId: `account-${user.id}`, displayName: user.user_metadata.full_name,
        avatarPreset: "avatar-1", authProvider: "google", authSubject: user.id, email: user.email }));
    localStorage.setItem("settle-friends-cloud-space", spaceId);
    localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
    localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(state));
    localStorage.setItem(`settle-friends-current-participant:account:${encodeURIComponent(user.id)}`,
      `account-${user.id}`);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    localStorage.setItem("qa-note-save-seeded", "1");
  }, { user, state: initialState, spaceId, spaceKey });


  await page.goto("/");
  const eventButton = page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first();
  await expect(eventButton).toBeVisible();
  await eventButton.click();
  await page.locator('[data-action="open-event-notes"]').click();
  if (status === "partial-create" || receiptConflict) await page.locator('[data-action="new-event-note"]').click();
  else await page.locator('.event-note-open[data-note-id="cache-sync-note"]').click();
  if (!deleteRetry) await page.locator('[data-action="event-note-body"]').fill("טיוטה שלא תאבד");
  writeStatus = receiptConflict ? 200 : partialRetry ? "partial" : pendingFollowup ? 503 : status;
  if (deleteRetry) {
    await page.locator('[data-action="request-delete-event-note"]').click();
    await page.locator('[data-action="confirm-important-action"]').click();
  } else await page.locator('[data-action="save-event-note"]').click();
  if (pendingFollowup) {
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText("ממתין לסנכרון");
    await page.locator('[data-nav-destination="home"]').click();
    await page.locator(`[data-action="open-event"][data-event-id="${secondEventId}"]`).first().click();
    await page.locator('[data-action="open-event-notes"]').click();
    await page.locator('[data-action="new-event-note"]').click();
    await page.locator('[data-action="event-note-body"]').fill("פתק באירוע אחר");
    // Keep the first event unavailable during navigation. Only the next Save
    // may deliver its pending intent in the recovery case.
    if (status === "pending-next-recovers") writeStatus = 200;
    await page.locator('[data-action="save-event-note"]').click();
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    expect(secondShared.state.events[0].notes.filter(note => note.body === "פתק באירוע אחר")).toHaveLength(1);
    const pending = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
    if (status === "pending-next-fails") {
      expect(pending?.events.find(event => event.id === eventId)?.notes.find(note => note.id === "cache-sync-note")?.body).toBe("טיוטה שלא תאבד");
      expect(shared.state.events[0].notes.find(note => note.id === "cache-sync-note")?.body).toBe("נשמר בענן");
      await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText("ממתין לסנכרון");
      writeStatus = 200;
      await reloadPage();
    }
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId), { timeout: 15_000 }).toBeNull();
    expect(shared.state.events[0].notes.find(note => note.id === "cache-sync-note")?.body).toBe("טיוטה שלא תאבד");
    expect(secondShared.state.events[0].notes.filter(note => note.body === "פתק באירוע אחר")).toHaveLength(1);
    await page.locator('[data-nav-destination="home"]').click();
    await eventButton.click();
    await page.locator('[data-action="open-event-notes"]').click();
    await expect(page.locator('.event-note-open[data-note-id="cache-sync-note"]')).toContainText("טיוטה שלא תאבד");
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
  } else if (receiptConflict) {
    await expect(page.locator(".event-note-modal")).toContainText("השינוי שלך לא נשמר");
    expect(competingNoteId).toBeTruthy();
    const attemptsBeforeRetry = canonicalAttempts;
    await page.locator('[data-action="save-event-note"]').click();
    await expect(page.locator('[data-action="save-event-note"]')).toBeEnabled();
    await expect(page.locator(".event-note-modal")).toContainText(status === "receipt-delete" ? "נמחק" : "אותו שדה");
    await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("טיוטה שלא תאבד");
    expect(canonicalAttempts).toBe(attemptsBeforeRetry);
    for (const snapshot of [shared, personal]) {
      const event = snapshot.state.events.find(event => event.id === eventId);
      expect(event.notes.filter(note => note.body === "טיוטה שלא תאבד")).toHaveLength(0);
      if (status === "receipt-delete") {
        expect(event.deletedNotes.filter(note => note.id === competingNoteId)).toHaveLength(1);
      } else {
        expect(event.notes.filter(note => note.id === competingNoteId)).toHaveLength(1);
        expect(event.notes.find(note => note.id === competingNoteId).body).toBe("שינוי מהמכשיר השני");
      }
    }
  } else if (restart) {
    if (partialRetry) await expect(page.locator(".event-note-modal")).toContainText("עדיין לא התקבל אישור");
    else await expect(page.locator(".event-note-modal")).toHaveCount(0);
    const pendingBefore = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
    const pendingEvent = pendingBefore.events.find(event => event.id === eventId);
    const intent = structuredClone(deleteRetry
      ? pendingEvent.deletedNotes.find(note => note.id === "cache-sync-note")
      : pendingEvent.notes.find(note => note.body === "טיוטה שלא תאבד"));
    expect(intent?.id).toBeTruthy();
    const assertLocalIntent = async () => {
      const pending = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
      const event = pending?.events.find(event => event.id === eventId);
      if (deleteRetry) {
        expect(event.deletedNotes.filter(note => note.id === intent.id)).toEqual([intent]);
        expect(event.notes.some(note => note.id === intent.id)).toBe(false);
      } else {
        expect(event.notes.filter(note => note.id === intent.id)).toEqual([intent]);
      }
    };
    // Reload while writes still fail: neither a new JS runtime nor a stale
    // personal snapshot may discard the accepted local intent.
    await reloadPage();
    await expect(eventButton).toBeVisible();
    await eventButton.click();
    await page.locator('[data-action="open-event-notes"]').click();
    await assertLocalIntent();
    if (deleteRetry) await expect(page.locator(`.event-note-open[data-note-id="${intent.id}"]`)).toHaveCount(0);
    else await expect(page.locator(`.event-note-open[data-note-id="${intent.id}"]`)).toContainText("טיוטה שלא תאבד");
    // Partial fixtures now reject shared writes with HTTP 403; distinguish
    // that actionable permission failure from the transient HTTP 503 case.
    await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText(
      partialRetry ? "השינויים ממתינים במכשיר. אין הרשאה לסנכרן אותם" : "ממתין לסנכרון"
    );
    await expect(page.locator(".public-sync-status:visible")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("save-feedback-pending-restart.png"), fullPage: true, animations: "disabled" });
    writeStatus = 200;
    // A fresh boot after recovery must deliver without an imported store call
    // or a second Save/Delete click.
    const recoveryStartedAt = Date.now();
    await reloadPage();
    await expect(eventButton).toBeVisible();
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId), { timeout: 15_000 }).toBeNull();
    await testInfo.attach("restart-recovery", { contentType: "application/json", body: JSON.stringify({
      status, project: testInfo.project.name, noteId: intent.id,
      recoveredBootMs: Date.now() - recoveryStartedAt,
      backend: "synthetic HTTP responses; not a live-network latency benchmark"
    }) });
    for (const snapshot of [shared, personal]) {
      const event = snapshot.state.events.find(event => event.id === eventId);
      if (deleteRetry) {
        expect(event.notes.some(note => note.id === intent.id)).toBe(false);
        expect(event.deletedNotes.filter(note => note.id === intent.id)).toEqual([intent]);
      } else {
        expect(event.notes.filter(note => note.body === "טיוטה שלא תאבד")).toHaveLength(1);
        expect(event.notes.find(note => note.id === intent.id)?.body).toBe("טיוטה שלא תאבד");
      }
    }
    await eventButton.click();
    await page.locator('[data-action="open-event-notes"]').click();
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
  } else if (deleteRetry) {
    await expect(page.locator(".event-note-modal")).toContainText("עדיין לא התקבל אישור למחיקת");
    await expect(page.locator('[data-action="save-event-note"]')).toBeDisabled();
    await expect(page.locator('[data-action="event-note-body"]')).toHaveAttribute("readonly", "");
    expect(canonicalAttempts).toBeGreaterThanOrEqual(2);
    const tombstone = structuredClone(shared.state.events[0].deletedNotes.find(note => note.id === "cache-sync-note"));
    const attemptsBeforeRetry = canonicalAttempts;
    writeStatus = 200;
    await page.locator('[data-action="request-delete-event-note"]').click();
    await page.locator('[data-action="confirm-important-action"]').click();
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    await expect(page.locator(".important-action-dialog")).toHaveCount(0);
    expect(canonicalAttempts).toBeGreaterThan(attemptsBeforeRetry);
    expect(shared.state.events[0].notes.some(note => note.id === "cache-sync-note")).toBe(false);
    expect(shared.state.events[0].deletedNotes.filter(note => note.id === "cache-sync-note")).toEqual([tombstone]);
    expect(personal.state.events[0].notes.some(note => note.id === "cache-sync-note")).toBe(false);
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId)).toBeNull();
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
  } else if (partialRetry) {
    await expect(page.locator(".event-note-modal")).toContainText("עדיין לא התקבל אישור");
    await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("טיוטה שלא תאבד");
    expect(canonicalAttempts).toBeGreaterThanOrEqual(2);
    const attemptedId = shared.state.events[0].notes.find(note => note.body === "טיוטה שלא תאבד").id;
    const attemptsBeforeRetry = canonicalAttempts;
    writeStatus = 200;
    await page.locator('[data-action="save-event-note"]').click();
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    expect(canonicalAttempts).toBeGreaterThan(attemptsBeforeRetry);
    const savedNotes = shared.state.events[0].notes.filter(note => note.body === "טיוטה שלא תאבד");
    expect(savedNotes).toHaveLength(1);
    expect(savedNotes[0].id).toBe(attemptedId);
    expect(personal.state.events[0].notes.filter(note => note.body === "טיוטה שלא תאבד")).toHaveLength(1);
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId)).toBeNull();
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    await expect(page.locator(".public-sync-status:visible")).toHaveCount(0);
  } else if (status === 403) {
    await expect(page.locator(".event-note-modal")).toBeVisible();
    await expect(page.locator(".event-note-modal")).toContainText("אין לחשבון הרשאה");
    await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("טיוטה שלא תאבד");
    await expect(page.getByText("השינוי לא נשמר.", { exact: true })).toHaveCount(0);
    await expect(page.locator(".public-sync-status:visible")).toHaveCount(0);
    expect(canonicalAttempts).toBeGreaterThan(0);
    expect(canonicalAttempts).toBeLessThanOrEqual(2);
  } else {
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText("ממתין לסנכרון");
    await expect(page.locator(".public-sync-status:visible")).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes("pending-sync") && localStorage.getItem(key).includes("טיוטה שלא תאבד")))).toBe(true);
    writeStatus = 200;
    const outcome = await page.evaluate(async () => (await import("/src/data/localStore.mjs")).flushPendingSharedState());
    expect(outcome.ok).toBe(true);
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    expect(shared.state.events[0].notes.filter(note => note.id === "cache-sync-note")).toHaveLength(1);
    expect(shared.state.events[0].notes[0].body).toBe("טיוטה שלא תאבד");
  }
  if (reloadDiagnostics.length) await testInfo.attach("webkit-document-replacement-diagnostics", {
    contentType: "application/json", body: JSON.stringify(reloadDiagnostics)
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("save-feedback.png"), fullPage: true, animations: "disabled" });
});
}
