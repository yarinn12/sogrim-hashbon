import { expect, test } from "@playwright/test";
test.use({ serviceWorkers: "block" });
// Synthetic backend only: actual app controls, local durable outbox and status UI.
for (const status of [403, 503, "partial-create", "partial-edit", "partial-delete"]) {
const partialRetry = String(status).startsWith("partial-");
const deleteRetry = status === "partial-delete";
test(partialRetry ? `note ${status} retry confirms one note without duplication` : `note save feedback handles HTTP ${status} without false offline alerts`, async ({ page }, testInfo) => {
  let writeStatus = 200, canonicalAttempts = 0;
  const origin = "https://egress-cache-test.supabase.co";
  const userId = "egress-cache-user";
  const participantId = `account-${userId}`;
  const spaceId = "egress-cache-account";
  const sharedId = "egress-cache-shared";
  const spaceKey = "abcdefghijklmnopqrstuvwxyz_123456";
  const eventId = "egress-cache-event";
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
  let personal = { id: spaceId, state: structuredClone(initialState), updated_at: initialVersion };
  const shared = { id: sharedId, state: structuredClone(initialState), updated_at: initialVersion };
  const reads = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
      const writtenEvent = request.postDataJSON().p_state.events[0];
      if (deleteRetry ? writtenEvent?.deletedNotes?.some(note => note.id === "cache-sync-note")
        : writtenEvent?.notes?.some(note => note.body === "טיוטה שלא תאבד")) canonicalAttempts++;
      // One canonical commit followed by a failed personal write and rejected
      // immediate canonical retry creates genuine partial progress in the store.
      if (writeStatus === "partial") {
        if (canonicalAttempts > 1) return reply({ message: "Synthetic later rejection" }, { status: 403 });
      } else if (writeStatus !== 200) return reply({ message: "Synthetic rejection" }, { status: writeStatus });
      shared.state = request.postDataJSON().p_state;
      shared.updated_at = new Date().toISOString();
      return reply({ status: "updated", updatedAt: shared.updated_at });
    }
    if (url.pathname.endsWith("/app_snapshots")) {
      if (request.method() === "GET") {
        const fields = (url.searchParams.get("select") || "id,state,updated_at").split(",");
        const isIndex = url.searchParams.has("snapshot_kind");
        const row = isIndex || url.searchParams.get("id") === `eq.${sharedId}` ? shared : personal;
        const rows = [Object.fromEntries(fields.map((field) => [field, row[field]]))];
        reads.push({ kind: isIndex ? "index" : row.id, fields, version: row.updated_at });
        return reply(rows, { headers: { ...headers, "content-range": "0-0/1" } });
      }
      const body = request.postDataJSON();
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
  }, { user, state: initialState, spaceId, spaceKey });


  await page.goto("/");
  const eventButton = page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first();
  await expect(eventButton).toBeVisible();
  await eventButton.click();
  await page.locator('[data-action="open-event-notes"]').click();
  if (status === "partial-create") await page.locator('[data-action="new-event-note"]').click();
  else await page.locator('.event-note-open[data-note-id="cache-sync-note"]').click();
  if (!deleteRetry) await page.locator('[data-action="event-note-body"]').fill("טיוטה שלא תאבד");
  writeStatus = partialRetry ? "partial" : status;
  if (deleteRetry) {
    await page.locator('[data-action="request-delete-event-note"]').click();
    await page.locator('[data-action="confirm-important-action"]').click();
  } else await page.locator('[data-action="save-event-note"]').click();
  if (deleteRetry) {
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
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("save-feedback.png"), fullPage: true, animations: "disabled" });
});
}
