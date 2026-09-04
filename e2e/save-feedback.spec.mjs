import { expect, test } from "@playwright/test";
test.use({ serviceWorkers: "block" });
// Synthetic backend only: actual app controls, local durable outbox and status UI.
for (const status of [403, 503]) {
test(`note save feedback handles HTTP ${status} without false offline alerts`, async ({ page }, testInfo) => {
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
      if (request.postDataJSON().p_state.events[0]?.notes?.some(note => note.body === "טיוטה שלא תאבד")) canonicalAttempts++;
      if (writeStatus !== 200) return reply({ message: "Synthetic rejection" }, { status: writeStatus });
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
  await page.locator('.event-note-open[data-note-id="cache-sync-note"]').click();
  await page.locator('[data-action="event-note-body"]').fill("טיוטה שלא תאבד");
  writeStatus = status;
  await page.locator('[data-action="save-event-note"]').click();
  if (status === 403) {
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
