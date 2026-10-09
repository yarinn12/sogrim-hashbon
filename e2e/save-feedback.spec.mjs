import { expect, test } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { updateEventNote, removeEventNote } from "../src/domain/eventNotes.mjs";
import { isWebKitReloadDiagnostic } from "./helpers/reloadDiagnostics.mjs";
import { installNoteEditorDiagnostics, attachNoteEditorDiagnostics, installDelayedDialogFrameFixture } from "./helpers/noteEditorDiagnostics.mjs";
test.use({ serviceWorkers: "block" });
test.afterEach(async ({ page }, testInfo) => {
  if (process.env.NOTE_EDITOR_DIAGNOSTICS === "1") await attachNoteEditorDiagnostics(page, testInfo);
});

async function assertQuietParticipantRoster(page, testInfo, phase) {
  const roster = page.locator(".event-participant-roster-modal");
  await expect(roster).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime)
  ).length)).toBe(0);
  const previewSize = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
  if (previewSize) await expect(page.locator("html")).toHaveCSS("font-size", `${previewSize}px`);
  await expect(roster.locator("[data-route-sync-status]")).toBeHidden();
  await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
  const geometry = await roster.evaluate(node => {
    const header = node.querySelector(".event-modal-header").getBoundingClientRect();
    const body = node.querySelector(".event-modal-body").getBoundingClientRect();
    const status = node.querySelector("[data-route-sync-status]").getBoundingClientRect();
    return { bodyGap: body.top - header.bottom, statusHeight: status.height };
  });
  expect(geometry.statusHeight, `${phase}: a hidden status must consume no height`).toBe(0);
  expect(geometry.bodyGap, `${phase}: the roster must start directly below the header`).toBeLessThanOrEqual(24);
  expect(geometry.bodyGap, `${phase}: the roster must not overlap the header`).toBeGreaterThanOrEqual(-1);
  await expect(roster.locator(".event-participant-roster-row").first()).toBeInViewport();
  await testInfo.attach(`participant-roster-${phase}`, { contentType: "application/json", body: JSON.stringify(geometry) });
  await page.screenshot({ path: testInfo.outputPath(`participant-roster-${phase}.png`), animations: "disabled" });
}
// Synthetic backend only: actual app controls, local durable outbox and status UI.
for (const { status, restart = false, delayedDialogFrame = false, offline = false, permissionContext = false } of [
  ...[403, 503, "delayed-success", "transient-recovery", "partial-create", "partial-edit", "partial-delete"].map(status => ({ status })),
  ...[503, "partial-create", "partial-edit", "partial-delete"].map(status => ({ status, restart: true })),
  { status: "partial-create", restart: true, permissionContext: true },
  ...["receipt-edit", "receipt-delete", "pending-next-fails", "pending-next-recovers"].map(status => ({ status })),
  { status: "pending-next-recovers", delayedDialogFrame: true },
  { status: 503, offline: true }
]) {
const partialRetry = String(status).startsWith("partial-");
const deleteRetry = status === "partial-delete";
const receiptConflict = String(status).startsWith("receipt-");
const pendingFollowup = String(status).startsWith("pending-next-");
const includeSecondEvent = pendingFollowup || permissionContext;
const quietRecovery = ["delayed-success", "transient-recovery"].includes(status);
const testName = permissionContext ? "permission summary identifies the pending event, opens it, and clears only after acknowledgement" : pendingFollowup ? `note ${status} keeps earlier pending work covered by the next event save` : receiptConflict ? `new note ${status} conflict keeps the published identity on retry` : restart ? `note ${status} survives restart during outage and recovers automatically` : partialRetry ? `note ${status} retry confirms one note without duplication` : `note save feedback handles HTTP ${status} without false offline alerts`;
test(`${offline ? "offline: " : ""}${delayedDialogFrame ? "delayed dialog frame: " : ""}${testName}`, async ({ page, browserName }, testInfo) => {
  let writeStatus = 200, secondSharedStatus = permissionContext ? 403 : 200, canonicalAttempts = 0, personalConflicts = 0;
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
  if (includeSecondEvent) {
    initialState.events.push({ ...structuredClone(initialState.events[0]),
      id: secondEventId, name: "אירוע שני", sharedSpaceId: secondSharedId, notes: [] });
  }
  const permissionPending = permissionContext ? structuredClone(initialState) : null;
  if (permissionPending) {
    permissionPending.events[1].notes.push({
      id: "pending-permission-note", title: "דורש הרשאה", body: "שינוי שממתין להרשאה",
      pinned: false, createdByParticipantId: participantId, updatedByParticipantId: participantId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    permissionPending.__pendingSync = {
      version: 1, selection: { eventIds: [secondEventId], deletedEventIds: [] }
    };
  }
  let personal = { id: spaceId, state: structuredClone(initialState), updated_at: initialVersion };
  const shared = { id: sharedId, state: structuredClone(initialState), updated_at: initialVersion };
  shared.state.events = [shared.state.events[0]];
  const secondShared = includeSecondEvent ? {
    id: secondSharedId, state: { ...structuredClone(initialState), events: [structuredClone(initialState.events[1])] },
    updated_at: initialVersion
  } : null;
  const reads = [];
  const canonicalWrites = [], personalAttempts = [];
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
    window.__qaPendingNotices = [];
    new MutationObserver(() => {
      const pendingCopy = /ממתינ[\u0590-\u05ff]* לסנכרון|נשמר[\u0590-\u05ff]* במכשיר|השלמת הסנכרון|השינויים ממתינים במכשיר|[יוות]סתנכר[\u0590-\u05ff]* אוטומטית/;
      if (pendingCopy.test(document.body?.textContent || "") && pendingCopy.test(document.body.innerText)) {
        window.__qaPendingNotices.push(document.body.innerText.match(pendingCopy)[0]);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] });
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
    if (dynamicType) await expect(page.locator("html")).toHaveCSS("font-size", `${dynamicType}px`);
  };
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-space-key",
    "access-control-allow-methods": "GET, PATCH, POST, OPTIONS"
  };
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(testInfo.project.use.baseURL).origin ? route.continue() : route.abort());
  if (process.env.NOTE_EDITOR_DIAGNOSTICS === "1") await installNoteEditorDiagnostics(page);
  if (delayedDialogFrame) await installDelayedDialogFrameFixture(page);
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
      const target = includeSecondEvent && payload.p_snapshot_id === secondSharedId ? secondShared : shared;
      if (deleteRetry ? writtenEvent?.deletedNotes?.some(note => note.id === "cache-sync-note")
        : writtenEvent?.notes?.some(note => note.body === "טיוטה שלא תאבד")) canonicalAttempts++;
      if (quietRecovery && canonicalAttempts > 0) {
        if (status === "transient-recovery" && canonicalAttempts <= 2) {
          return reply({ message: "Synthetic temporary outage" }, { status: 503 });
        }
        // Model a slow acknowledgement; the recovery case first exhausts the
        // immediate retries, then delivers inside the bounded quiet window.
        await delay(2_500);
      }
      if (permissionContext && target === secondShared && secondSharedStatus !== 200) {
        return reply({ message: "Synthetic pending sibling lacks permission" }, { status: secondSharedStatus });
      }
      // The shared write commits once. A later personal failure must retain
      // that receipt without requiring another canonical publication. Reject
      // a duplicate so the test catches a false "unconfirmed note" warning.
      if (partialRetry && !permissionContext && canonicalAttempts > 1) {
        return reply({ message: "Synthetic duplicate shared write rejected" }, { status: 403 });
      }
      if (writeStatus !== 200 && writeStatus !== "partial" && target !== secondShared) {
        return reply({ message: "Synthetic rejection" }, { status: writeStatus });
      }
      target.state = payload.p_state;
      target.updated_at = new Date().toISOString();
      const receipt = { status: "updated", updatedAt: target.updated_at };
      canonicalWrites.push({ snapshotId: payload.p_snapshot_id, state: structuredClone(payload.p_state), receipt });
      return reply(receipt);
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
        personalAttempts.push({ body: structuredClone(body), status: 503 });
        return reply({ message: "Synthetic personal response lost after peer update" }, { status: 503 });
      }
      const expectedVersion = url.searchParams.get("updated_at")?.replace(/^eq\./, "");
      if (expectedVersion && expectedVersion !== personal.updated_at) {
        personalConflicts++;
        personalAttempts.push({ body: structuredClone(body), status: 200, casConflict: true });
        return reply([]);
      }
      if (writeStatus === "partial" && canonicalAttempts > 0) {
        personalAttempts.push({ body: structuredClone(body), status: 503 });
        return reply({ message: "Synthetic personal outage" }, { status: 503 });
      }
      personalAttempts.push({ body: structuredClone(body), status: 200 });
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
  await page.addInitScript(({ user, state, spaceId, spaceKey, permissionPending }) => {
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
    if (permissionPending) localStorage.setItem(`settle-friends-pending-sync:${spaceId}`, JSON.stringify(permissionPending));
    localStorage.setItem(`settle-friends-current-participant:account:${encodeURIComponent(user.id)}`,
      `account-${user.id}`);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    localStorage.setItem("qa-note-save-seeded", "1");
  }, { user, state: initialState, spaceId, spaceKey, permissionPending });


  const dynamicType = (offline || restart)
    ? Number(testInfo.project.metadata?.dynamicTypePreview || 0) : 0;
  await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : "/");
  if (dynamicType) await expect(page.locator("html")).toHaveCSS("font-size", `${dynamicType}px`);
  if (process.env.NOTE_EDITOR_DIAGNOSTICS === "1") await expect.poll(() => page.evaluate(() => typeof window.__qaNoteEditorState)).toBe("function");
  const eventButton = page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first();
  await expect(eventButton).toBeVisible();
  await eventButton.click();
  await page.locator('[data-action="open-event-notes"]').click();
  if (status === "partial-create" || receiptConflict) await page.locator('[data-action="new-event-note"]').click();
  else await page.locator('.event-note-open[data-note-id="cache-sync-note"]').click();
  if (!deleteRetry) await page.locator('[data-action="event-note-body"]').fill("טיוטה שלא תאבד");
  if (quietRecovery) await page.evaluate(() => {
    window.__qaSyncFeedback = { statuses: [], visible: [] };
    addEventListener("sogrim:sync-status", event => window.__qaSyncFeedback.statuses.push(event.detail));
    new MutationObserver(() => {
      for (const node of document.querySelectorAll("[data-inline-sync-status], .public-sync-status")) {
        if (!node.hidden && node.getClientRects().length && node.textContent.trim()) {
          window.__qaSyncFeedback.visible.push(node.textContent.trim());
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  });
  writeStatus = receiptConflict || quietRecovery ? 200 : partialRetry ? "partial" : pendingFollowup ? 503 : status;
  if (deleteRetry) {
    await page.locator('[data-action="request-delete-event-note"]').click();
    await page.locator('[data-action="confirm-important-action"]').click();
  } else await page.locator('[data-action="save-event-note"]').click();
  if (quietRecovery) {
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId)).toBeNull();
    await expect(page.locator('.event-note-open[data-note-id="cache-sync-note"]')).toContainText("טיוטה שלא תאבד");
    expect(shared.state.events[0].notes.find(note => note.id === "cache-sync-note")?.body).toBe("טיוטה שלא תאבד");
    expect(personal.state.events[0].notes.find(note => note.id === "cache-sync-note")?.body).toBe("טיוטה שלא תאבד");
    const feedback = await page.evaluate(() => window.__qaSyncFeedback);
    expect(feedback.statuses.some(detail => detail.status === "saving")).toBe(true);
    if (status === "transient-recovery") {
      expect(feedback.statuses.some(detail => detail.pending === true)).toBe(true);
      expect(canonicalAttempts).toBeGreaterThanOrEqual(3);
    }
    expect(feedback.visible).toEqual([]);
    expect(feedback.statuses.at(-1).pending).toBe(false);
    await testInfo.attach("quiet-sync-feedback", { contentType: "application/json", body: JSON.stringify(feedback) });
  } else if (pendingFollowup) {
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    await page.locator('[data-nav-destination="home"]').click();
    await expect(page.locator("[data-sync-account-summary]")).toBeHidden();
    await page.locator(`[data-action="open-event"][data-event-id="${secondEventId}"]`).first().click();
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    await page.locator('[data-action="open-event-notes"]').click();
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    if (delayedDialogFrame) await page.evaluate(() => { window.__qaDelayNextNoteDialog = true; });
    await page.locator('[data-action="new-event-note"]').click();
    if (delayedDialogFrame) {
      const deferredFrames = await page.evaluate(() => {
        document.querySelector('[data-action="event-note-body"]').focus();
        return window.__qaFlushDialogFrames();
      });
      expect(deferredFrames).toBeGreaterThan(0);
      await page.keyboard.insertText("פתק באירוע אחר");
      await expect(page.locator('[data-action="event-note-body"]')).toHaveValue("פתק באירוע אחר");
    } else await page.locator('[data-action="event-note-body"]').fill("פתק באירוע אחר");
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
      await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
      await page.locator('[data-nav-destination="home"]').click();
      await expect(page.locator("[data-sync-account-summary]")).toBeHidden();
      await eventButton.click();
      await page.locator('[data-action="open-event-notes"]').click();
      await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
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
    expect(personalConflicts).toBeGreaterThan(0);
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
    expect(personalAttempts.some(attempt => attempt.status === 200 && !attempt.casConflict &&
      (status === "receipt-delete"
        ? attempt.body.state.events[0].deletedNotes.some(note => note.id === competingNoteId)
        : attempt.body.state.events[0].notes.some(note => note.id === competingNoteId && note.body === "שינוי מהמכשיר השני")))).toBe(true);
  } else if (restart) {
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    const pendingBefore = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
    if (permissionContext) {
      expect(pendingBefore.__pendingSync.selection.eventIds).toContain(secondEventId);
      expect(pendingBefore.events.find(event => event.id === secondEventId).notes
        .some(note => note.id === "pending-permission-note")).toBe(true);
      expect(secondShared.state.events[0].notes.some(note => note.id === "pending-permission-note")).toBe(false);
      expect(canonicalWrites.some(write => write.snapshotId === sharedId && write.receipt.status === "updated" &&
        write.state.events[0].notes.some(note => note.body === "טיוטה שלא תאבד"))).toBe(true);
    }
    if (partialRetry && !permissionContext) {
      expect(pendingBefore.__pendingSync.selection).toEqual({ eventIds: [], deletedEventIds: [] });
      expect(canonicalAttempts).toBe(1);
      expect(canonicalWrites.filter(write => write.snapshotId === sharedId && (deleteRetry
        ? write.state.events[0].deletedNotes.some(note => note.id === "cache-sync-note")
        : write.state.events[0].notes.some(note => note.body === "טיוטה שלא תאבד")))).toHaveLength(1);
      await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    }
    const pendingEvent = pendingBefore.events.find(event => event.id === eventId);
    const intent = structuredClone(deleteRetry
      ? pendingEvent.deletedNotes.find(note => note.id === "cache-sync-note")
      : pendingEvent.notes.find(note => note.body === "טיוטה שלא תאבד"));
    expect(intent?.id).toBeTruthy();
    const personalAttemptContainsIntent = attempt => {
      const event = attempt.body.state.events.find(event => event.id === eventId);
      return deleteRetry
        ? event?.deletedNotes.some(note => note.id === intent.id && note.deletedAt === intent.deletedAt)
        : event?.notes.some(note => note.id === intent.id && note.body === intent.body);
    };
    if (partialRetry && !permissionContext) {
      const failedPersonalWrites = personalAttempts.filter(personalAttemptContainsIntent);
      expect(failedPersonalWrites.length).toBeGreaterThan(0);
      expect(failedPersonalWrites.every(attempt => attempt.status === 503)).toBe(true);
      expect(canonicalWrites.find(write => write.snapshotId === sharedId && (deleteRetry
        ? write.state.events[0].deletedNotes.some(note => note.id === intent.id && note.deletedAt === intent.deletedAt)
        : write.state.events[0].notes.some(note => note.id === intent.id && note.body === intent.body)))?.receipt.status).toBe("updated");
    }
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
    if (permissionContext) {
      const summary = page.locator("[data-sync-account-summary]");
      await expect(summary).toContainText("אין הרשאה לבצע את השינוי");
      await expect(summary).toContainText("אירוע שני");
      const reviewButton = summary.locator('[data-action="open-event"]');
      await expect(reviewButton).toHaveAttribute("data-event-id", secondEventId);
      await expect(reviewButton).toBeEnabled();
      await reviewButton.click();
      await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();
    }
    if (!partialRetry) {
      await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
      await page.waitForTimeout(5_200);
      await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    }
    if (permissionContext) {
      await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText("אין הרשאה לבצע את השינוי");
      await page.getByRole("button", { name: "בית", exact: true }).click();
    }
    await eventButton.click();
    if (!permissionContext) {
      // Exercise the participant route with the real outbox restored by boot,
      // not just an injected status event. Navigation must preserve that intent.
      await page.locator('[data-action="open-event-participants"]').click();
      await assertQuietParticipantRoster(page, testInfo, "restored-outbox");
      await assertLocalIntent();
      await page.getByRole("button", { name: "בית", exact: true }).click();
      await eventButton.click();
    }
    await page.locator('[data-action="open-event-notes"]').click();
    await assertLocalIntent();
    if (deleteRetry) await expect(page.locator(`.event-note-open[data-note-id="${intent.id}"]`)).toHaveCount(0);
    else await expect(page.locator(`.event-note-open[data-note-id="${intent.id}"]`)).toContainText("טיוטה שלא תאבד");
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    if (permissionContext) {
      await page.getByRole("button", { name: "בית", exact: true }).click();
      await expect(page.locator("[data-sync-account-summary]")).toContainText("אירוע שני");
      await page.locator(`[data-action="open-event"][data-event-id="${secondEventId}"]`).first().click();
      await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText("אין הרשאה לבצע את השינוי");
      await page.getByRole("button", { name: "בית", exact: true }).click();
      await reloadPage();
      await expect(page.locator("[data-sync-account-summary]")).toContainText("אירוע שני");
      await assertLocalIntent();
    }
    expect(await page.evaluate(() => window.__qaPendingNotices)).toEqual([]);
    await expect(page.locator(".public-sync-status:visible")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("save-feedback-pending-restart.png"), fullPage: true, animations: "disabled" });
    writeStatus = 200;
    if (permissionContext) secondSharedStatus = 200;
    // A fresh boot after recovery must deliver without an imported store call
    // or a second Save/Delete click.
    const recoveryStartedAt = Date.now();
    await reloadPage();
    await expect(eventButton).toBeVisible();
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId), { timeout: 15_000 }).toBeNull();
    if (partialRetry && !permissionContext) {
      expect(canonicalAttempts).toBe(1);
      expect(personalAttempts.some(attempt => attempt.status === 200 && personalAttemptContainsIntent(attempt))).toBe(true);
    }
    if (permissionContext) await expect(page.locator("[data-sync-account-summary]")).toBeHidden();
    if (permissionContext) {
      expect(secondShared.state.events[0].notes.filter(note => note.id === "pending-permission-note")).toHaveLength(1);
      expect(personal.state.events.find(event => event.id === secondEventId).notes
        .filter(note => note.id === "pending-permission-note")).toHaveLength(1);
    }
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
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    expect(canonicalAttempts).toBe(1);
    const deletionWrites = canonicalWrites.filter(write => write.snapshotId === sharedId &&
      write.state.events[0].deletedNotes.some(note => note.id === "cache-sync-note"));
    expect(deletionWrites).toHaveLength(1);
    expect(deletionWrites[0].receipt.status).toBe("updated");
    const tombstone = structuredClone(shared.state.events[0].deletedNotes.find(note => note.id === "cache-sync-note"));
    expect(tombstone?.id).toBe("cache-sync-note");
    expect(deletionWrites[0].state.events[0].deletedNotes).toContainEqual(tombstone);
    const tombstonePersonalAttempts = personalAttempts.filter(attempt =>
      attempt.body.state.events[0].deletedNotes.some(note => note.id === tombstone.id));
    expect(tombstonePersonalAttempts.length).toBeGreaterThan(0);
    expect(tombstonePersonalAttempts.every(attempt => attempt.status === 503)).toBe(true);
    const pending = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
    expect(pending.__pendingSync.selection).toEqual({ eventIds: [], deletedEventIds: [] });
    expect(pending.events[0].deletedNotes).toContainEqual(tombstone);
    expect(personal.state.events[0].notes.some(note => note.id === tombstone.id)).toBe(true);
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    const attemptsBeforeRetry = canonicalAttempts;
    writeStatus = 200;
    const outcome = await page.evaluate(async () => (await import("/src/data/localStore.mjs")).flushPendingSharedState());
    expect(outcome.ok).toBe(true);
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    await expect(page.locator(".important-action-dialog")).toHaveCount(0);
    expect(canonicalAttempts).toBe(attemptsBeforeRetry);
    expect(shared.state.events[0].notes.some(note => note.id === "cache-sync-note")).toBe(false);
    expect(shared.state.events[0].deletedNotes.filter(note => note.id === "cache-sync-note")).toEqual([tombstone]);
    expect(personal.state.events[0].notes.some(note => note.id === "cache-sync-note")).toBe(false);
    await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId)).toBeNull();
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
  } else if (partialRetry) {
    await expect(page.locator(".event-note-modal")).toHaveCount(0);
    expect(canonicalAttempts).toBe(1);
    const noteWrites = canonicalWrites.filter(write => write.snapshotId === sharedId &&
      write.state.events[0].notes.some(note => note.body === "טיוטה שלא תאבד"));
    expect(noteWrites).toHaveLength(1);
    expect(noteWrites[0].receipt.status).toBe("updated");
    const attemptedId = shared.state.events[0].notes.find(note => note.body === "טיוטה שלא תאבד").id;
    const notePersonalAttempts = personalAttempts.filter(attempt =>
      attempt.body.state.events[0].notes.some(note => note.id === attemptedId && note.body === "טיוטה שלא תאבד"));
    expect(notePersonalAttempts.length).toBeGreaterThan(0);
    expect(notePersonalAttempts.every(attempt => attempt.status === 503)).toBe(true);
    const pending = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
    expect(pending.__pendingSync.selection).toEqual({ eventIds: [], deletedEventIds: [] });
    expect(pending.events[0].notes.find(note => note.id === attemptedId)?.body).toBe("טיוטה שלא תאבד");
    expect(personal.state.events[0].notes.find(note => note.id === attemptedId)?.body).not.toBe("טיוטה שלא תאבד");
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    const attemptsBeforeRetry = canonicalAttempts;
    writeStatus = 200;
    const outcome = await page.evaluate(async () => (await import("/src/data/localStore.mjs")).flushPendingSharedState());
    expect(outcome.ok).toBe(true);
    expect(canonicalAttempts).toBe(attemptsBeforeRetry);
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
    if (offline) await page.context().setOffline(true);
    await page.waitForTimeout(5_200);
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    await expect(page.locator(".public-sync-status:visible")).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes("pending-sync") && localStorage.getItem(key).includes("טיוטה שלא תאבד")))).toBe(true);
    if (offline) {
      await page.getByRole("button", { name: "בית", exact: true }).click();
      await eventButton.click();
      await page.locator('[data-action="open-event-participants"]').click();
      await assertQuietParticipantRoster(page, testInfo, "offline");
      const outbox = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
      expect(outbox.events.find(event => event.id === eventId).notes.find(note => note.id === "cache-sync-note")?.body).toBe("טיוטה שלא תאבד");
    }
    writeStatus = 200;
    if (offline) await page.context().setOffline(false);
    const outcome = await page.evaluate(async () => (await import("/src/data/localStore.mjs")).flushPendingSharedState());
    expect(outcome.ok).toBe(true);
    await expect(page.locator("[data-inline-sync-status]:visible")).toHaveCount(0);
    expect(shared.state.events[0].notes.filter(note => note.id === "cache-sync-note")).toHaveLength(1);
    expect(shared.state.events[0].notes[0].body).toBe("טיוטה שלא תאבד");
    if (offline) {
      await expect.poll(() => page.evaluate(spaceId => localStorage.getItem(`settle-friends-pending-sync:${spaceId}`), spaceId)).toBeNull();
      expect(personal.state.events[0].notes.filter(note => note.id === "cache-sync-note")).toHaveLength(1);
      expect(personal.state.events[0].notes[0].body).toBe("טיוטה שלא תאבד");
      await assertQuietParticipantRoster(page, testInfo, "reconnected");
    }
  }
  if (reloadDiagnostics.length) await testInfo.attach("webkit-document-replacement-diagnostics", {
    contentType: "application/json", body: JSON.stringify(reloadDiagnostics)
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__qaPendingNotices)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("save-feedback.png"), fullPage: true, animations: "disabled" });
});
}
