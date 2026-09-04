import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// All account/cloud traffic is synthetic: this regression must not consume
// production Supabase egress or create disposable production accounts.
test("version-only refreshes preserve shared notes on home and in an open event", async ({ page }, testInfo) => {
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
  const metadataIndexes = () => reads.filter((read) => read.kind === "index" && !read.fields.includes("state"));
  await expect.poll(() => metadataIndexes().length, { timeout: 25_000 }).toBeGreaterThan(0);
  expect(reads.some((read) => read.kind === spaceId && read.fields.join(",") === "updated_at")).toBe(true);

  // Another device updates the canonical event while this account's personal
  // snapshot version stays unchanged. A warm account scan must still find it.
  const updateNote = (title, version) => {
    shared.state.events[0].notes[0].title = title;
    shared.state.events[0].notes[0].updatedAt = version;
    shared.state.events[0].updatedAt = version;
    shared.updated_at = version;
  };
  updateNote("פתק שהתעדכן ממכשיר שני", "2026-09-04T08:01:00.000Z");
  await expect.poll(() => reads.some((read) =>
    read.kind === "index" && read.fields.includes("state") && read.version === shared.updated_at
  ), { timeout: 25_000 }).toBe(true);

  await eventButton.click();
  await page.locator('[data-action="open-event-notes"]').click();
  await expect(page.getByText("פתק שהתעדכן ממכשיר שני", { exact: true })).toBeVisible();
  updateNote("עדכון בזמן שהפתקים פתוחים", "2026-09-04T08:02:00.000Z");
  await expect(page.getByText("עדכון בזמן שהפתקים פתוחים", { exact: true }))
    .toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("פתק שהתעדכן ממכשיר שני", { exact: true })).toHaveCount(0);
  // Visibility alone would not catch a card obscured by fixed navigation.
  // A normal (non-forced) click must open the actual updated note editor.
  await page.locator('.event-note-open[data-note-id="cache-sync-note"]').click();
  await expect(page.locator(".event-note-modal")).toBeVisible();
  await expect(page.locator('[data-action="event-note-title"]'))
    .toHaveValue("עדכון בזמן שהפתקים פתוחים");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("warm-cache-shared-note.png"), fullPage: true, animations: "disabled" });
});
