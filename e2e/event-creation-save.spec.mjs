import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const owner = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const spaceId = "creation-qa-personal", spaceKey = "abcdefghijklmnopqrstuvwxyz_123456";
const origin = "https://creation-save-qa.supabase.co";
const headers = { "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-space-key",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };

for (const mode of ["slow", "rejected", "old-rejected"]) {
test(`connected event creation stays usable with ${mode} cloud publication`, async ({ page }, testInfo) => {
  const version = new Date().toISOString();
  const profiles = [owner, peer].map((id, index) => ({ user_id: id,
    display_name: index ? "חבר לבדיקה" : "משתמש בדיקה", username: index ? "qa_peer" : "qa_owner",
    avatar_preset: "avatar-1", avatar_image: null, avatar_image_updated_at: null, updated_at: version }));
  const initial = { currentParticipantId: `account-${owner}`, participants: profiles.map(profile => ({
    id: `account-${profile.user_id}`, displayName: profile.display_name,
    avatarPreset: "avatar-1", kind: "user", accountLinked: true, profileUpdatedAt: version
  })), events: [], groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [] };
  const oldEventId = "old-rejected-event", oldSpaceId = "old-rejected-space";
  if (mode === "old-rejected") initial.events.push({
    id: oldEventId, name: "קבוצה ישנה עם שינוי ממתין", eventType: "standard", currency: "ILS", createdAt: version,
    participantIds: [`account-${owner}`], adminIds: [`account-${owner}`], createdByParticipantId: `account-${owner}`,
    sharedSpaceId: oldSpaceId, sharedSpaceKey: "old-rejected-space-key-long-enough-123456", expenses: [], transfers: [],
    notes: [{ id: "old-pending-note", body: "Keep old local intent", createdAt: version, updatedAt: version,
      createdByParticipantId: `account-${owner}`, updatedByParticipantId: `account-${owner}` }]
  });
  const user = { id: owner, email: "creation-qa@example.test", app_metadata: { provider: "google" },
    user_metadata: { full_name: profiles[0].display_name, username: "qa_owner", account_space_id: spaceId, account_space_key: spaceKey } };
  let personal = { id: spaceId, state: structuredClone(initial), updated_at: version };
  const canonical = new Map(); let creates = 0, notifications = 0;
  if (mode === "old-rejected") canonical.set(oldSpaceId, { id: oldSpaceId,
    state: { ...structuredClone(initial), events: [{ ...structuredClone(initial.events[0]), notes: [] }] }, updated_at: version });
  let release; const gate = new Promise(resolve => { release = resolve; });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(testInfo.project.use.baseURL).origin ? route.continue() : route.abort());
  await page.route("**/api/config", route => route.fulfill({ json: {
    launch: { cloudStorageReady: true },
    publicUrl: testInfo.project.use.baseURL, storage: { mode: "supabase", url: origin, anonKey: "synthetic-anon", table: "app_snapshots" }
  } }));
  await page.route("**/api/notifications/event-activity", route => {
    const payload = route.request().postDataJSON();
    expect(personal.state.events.some(event => event.id === payload.eventId && event.participantIds.includes(`account-${peer}`))).toBe(true);
    expect([...canonical.values()].some(row => row.state.events.some(event => event.id === payload.eventId && event.participantIds.includes(`account-${peer}`)))).toBe(true);
    notifications++;
    return route.fulfill({ json: { ok: true, membershipRecipients: 1 } });
  });
  await page.route(`${origin}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (request.method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname.endsWith("/ensure_account_workspace")) return reply({ status: "existing", workspaceId: spaceId });
    if (url.pathname.endsWith("/user_profiles")) {
      const selected = url.searchParams.get("user_id") === `eq.${owner}` ? profiles.slice(0, 1) : profiles;
      return reply(selected);
    }
    if (url.pathname.endsWith("/friendships")) return reply([{ id: "qa-friendship", requester_id: owner,
      addressee_id: peer, status: "accepted", requested_at: version, updated_at: version }]);
    if (url.pathname.endsWith("/create_shared_event_snapshot")) {
      creates++;
      if (mode === "rejected") return reply({ message: "Synthetic publication rejection" }, 403);
      await gate;
      const payload = request.postDataJSON();
      canonical.set(payload.p_snapshot_id, { id: payload.p_snapshot_id, state: payload.p_state, updated_at: new Date().toISOString() });
      return reply(true);
    }
    if (url.pathname.endsWith("/update_shared_event_snapshot")) {
      const payload = request.postDataJSON();
      if (payload.p_snapshot_id === oldSpaceId) return reply({ code: "42501", message: "Synthetic old group remains rejected" }, 403);
      const row = { id: payload.p_snapshot_id, state: payload.p_state, updated_at: new Date().toISOString() };
      canonical.set(row.id, row); return reply({ status: "updated", updatedAt: row.updated_at });
    }
    if (url.pathname.endsWith("/join_shared_event")) return reply(true);
    if (url.pathname.endsWith("/app_snapshots")) {
      if (request.method() === "GET") {
        const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
        const rows = url.searchParams.has("snapshot_kind") ? [...canonical.values()]
          : id === spaceId ? [personal] : canonical.has(id) ? [canonical.get(id)] : [];
        const fields = (url.searchParams.get("select") || "id,state,updated_at").split(",");
        return reply(rows.map(row => Object.fromEntries(fields.map(field => [field, row[field]]))));
      }
      const body = request.postDataJSON();
      personal = { id: spaceId, state: body.state, updated_at: body.updated_at || new Date().toISOString() };
      return reply([{ updated_at: personal.updated_at }]);
    }
    return request.method() === "GET" ? reply([]) : route.fulfill({ headers, status: 204 });
  });
  await page.addInitScript(({ user, initial, spaceId, spaceKey, mode }) => {
    localStorage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "qa-token", refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    localStorage.setItem("settle-friends-cloud-space", spaceId);
    localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
    localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(initial));
    if (mode === "old-rejected") localStorage.setItem(`settle-friends-pending-sync:${spaceId}`, JSON.stringify(initial));
    localStorage.setItem(`settle-friends-current-participant:account:${user.id}`, `account-${user.id}`);
    localStorage.setItem(`settle-friends-local-profile:account:${user.id}`, JSON.stringify({ participantId: `account-${user.id}`, displayName: user.user_metadata.full_name,
      username: "qa_owner", avatarPreset: "avatar-1", authProvider: "google", authSubject: user.id, email: user.email }));
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { user, initial, spaceId, spaceKey, mode });
  try {
    await page.goto("/");
    await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
    await page.locator('[data-action="new-event"]').first().click();
    await page.locator('[data-action="new-event-type"][data-event-type="standard"]').click();
    await page.locator('[data-action="new-event-name"]').fill("בדיקת יצירה עם חבר");
    await page.locator('[data-action="open-new-event-settlement"]').click();
    await page.locator('[data-action="open-new-event-participants"]').click();
    await page.locator('[data-action="set-new-event-participant-view"][data-participant-view="friends"]').click();
    await page.locator(`label[data-action="toggle-new-event-participant"][data-participant-id="account-${peer}"] .participant-pill-name`).click();
    await expect(page.locator(`[data-action="new-event-participant"][data-participant-id="account-${peer}"]`)).toBeChecked();
    await page.locator('[data-action="close-new-event-participant-view"]').click();
    const startedAt = performance.now();
    await page.locator('[data-action="create-event"]').click();
    await expect.poll(() => creates).toBeGreaterThan(0);
    if (mode === "rejected") {
      await expect(page.locator('[data-event-creation-step="settlement"]')).toBeVisible();
      await expect(page.locator(".notice")).toContainText("האירוע לא נשמר");
      await page.locator('[data-action="open-new-event-participants"]').click();
      await expect(page.locator('[data-action="create-event"]')).toBeEnabled();
      expect(personal.state.events).toHaveLength(0); expect(canonical.size).toBe(0);
    } else {
      const eventScreen = page.locator('[data-screen-kind="event"][data-event-id]');
      await expect(eventScreen).toBeVisible({ timeout: 3_000 });
      const displayedMs = Math.round(performance.now() - startedAt);
      const eventId = await eventScreen.getAttribute("data-event-id");
      await expect(page.locator("[data-inline-sync-status]:visible").first()).toContainText("ממתין לסנכרון");
      const outbox = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
      const queuedEvent = outbox.events.find(event => event.id === eventId);
      expect(queuedEvent).toBeTruthy();
      expect(queuedEvent.sharedSpaceId).toBeTruthy(); expect(queuedEvent.sharedSpaceKey).toBeTruthy();
      expect(queuedEvent.participantIds).toContain(`account-${peer}`);
      expect(notifications).toBe(0); expect(canonical.size).toBe(mode === "old-rejected" ? 1 : 0);
      await page.screenshot({ path: testInfo.outputPath("created-with-sync-pending.png"), fullPage: true });
      // Usable navigation while the actual canonical request is still held.
      await page.locator('[data-nav-destination="home"]').click();
      await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
      release();
      await expect.poll(() => personal.state.events.some(event => event.id === eventId)).toBe(true);
      await expect.poll(() => notifications).toBeGreaterThan(0);
      expect(canonical.size).toBe(mode === "old-rejected" ? 2 : 1); expect(creates).toBe(1);
      await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
      if (mode === "old-rejected") {
        const retained = await page.evaluate(spaceId => JSON.parse(localStorage.getItem(`settle-friends-pending-sync:${spaceId}`)), spaceId);
        expect(retained.events.find(event => event.id === oldEventId).notes).toEqual(initial.events[0].notes);
        expect(retained.__pendingSync.selection.eventIds).toEqual([oldEventId]);
        expect(canonical.get(oldSpaceId).state.events[0].notes).toEqual([]);
        await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
        await expect(page.locator('[data-inline-sync-status]:visible')).toHaveCount(0);
      }
      console.log(JSON.stringify({ kind: "local-event-create-held-cloud", device: testInfo.project.name, displayedMs, creates, canonicalEvents: canonical.size }));
    }
    expect(errors).toEqual([]);
  } finally { release(); }
});
}
