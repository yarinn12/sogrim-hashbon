import { test, expect } from "@playwright/test";
import { buildSharedEventState } from "../src/data/sharedEventStore.mjs";

test.use({ serviceWorkers: "block" });
const USER = "sequential-removal-owner";
const OWNER = `account-${USER}`;
const SPACE = "sequential-removal-account";
const KEY = "synthetic-sequential-removal-key-123456";
const ORIGIN = "https://sequential-removal-test.supabase.co";
const INITIAL = "2026-09-08T00:00:00.000Z";
const IDS = ["remove-a", "remove-b", "remove-c", "keep-d"];
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

async function fixture(page, testInfo, { firstStatus = 200, extraEvents = 0 } = {}) {
  const eventIds = [...IDS, ...Array.from({length: extraEvents}, (_, index) => `keep-extra-${index}`)];
  const user = {id: USER, email: "sequential-removal@example.test", app_metadata: {provider: "google"},
    user_metadata: {full_name: "בדיקת מחיקה", username: "sequential_removal", account_space_id: SPACE, account_space_key: KEY}};
  const initial = {currentParticipantId: OWNER, participants: [{id: OWNER, displayName: "בדיקת מחיקה", kind: "user", accountLinked: true, avatarPreset: "avatar-1"}],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: eventIds.map((id, index) => ({id, name: `אירוע למחיקה ${index + 1}`, eventType: "outing", currency: "ILS",
      participantIds: [OWNER], adminIds: [OWNER], createdByParticipantId: OWNER, createdAt: INITIAL, updatedAt: INITIAL,
      sharedSpaceId: `shared-${id}`, sharedSpaceKey: KEY, expenses: [], transfers: [], notes: [], activityLog: []}))};
  let personal = {id: SPACE, state: structuredClone(initial), updated_at: INITIAL};
  const shared = new Map(eventIds.map(id => [`shared-${id}`, {id: `shared-${id}`, state: buildSharedEventState(initial, id), updated_at: INITIAL}]));
  const firstStarted = deferred(), releaseFirst = deferred();
  const writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const headers = {"access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-space-key",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS"};
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(testInfo.project.use.baseURL).origin ? route.continue() : route.abort());
  await page.route("**/api/config", route => route.fulfill({json: {publicUrl: testInfo.project.use.baseURL,
    storage: {mode: "supabase", url: ORIGIN, anonKey: "synthetic-anon", table: "app_snapshots"}}}));
  await page.route(`${ORIGIN}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    const reply = (json, status = 200) => route.fulfill({headers, json, status});
    if (req.method() === "OPTIONS") return route.fulfill({headers, status: 204});
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname.endsWith("/rpc/ensure_account_workspace")) return reply({status: "existing", workspaceId: SPACE});
    if (url.pathname.endsWith("/rpc/join_shared_event")) return reply(true);
    if (url.pathname.endsWith("/rpc/update_shared_event_snapshot")) {
      const payload = req.postDataJSON(), row = shared.get(payload.p_snapshot_id);
      expect(row, "write targets only a synthetic event").toBeTruthy();
      if (payload.p_state.deletedEvents?.some(item => item.id === IDS[0])) {
        firstStarted.resolve();
        await releaseFirst.promise;
        if (firstStatus !== 200) return reply({message: "Synthetic rejected deletion"}, firstStatus);
      }
      row.state = structuredClone(payload.p_state);
      row.updated_at = new Date().toISOString();
      writes.push({kind: "shared", id: row.id, state: structuredClone(row.state)});
      return reply({status: "updated", updatedAt: row.updated_at});
    }
    if (url.pathname.endsWith("/app_snapshots")) {
      if (req.method() === "GET") {
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        const rows = url.searchParams.has("snapshot_kind") ? [...shared.values()] : [id === SPACE ? personal : shared.get(id)];
        expect(rows.every(Boolean), "read targets only synthetic workspaces").toBe(true);
        const fields = (url.searchParams.get("select") || "id,state,updated_at").split(",");
        return reply(rows.map(row => Object.fromEntries(fields.map(field => [field, row[field]]))));
      }
      const payload = req.postDataJSON();
      expect(url.searchParams.get("id") === `eq.${SPACE}` || payload.id === SPACE).toBe(true);
      personal = {...personal, state: structuredClone(payload.state), updated_at: payload.updated_at || new Date().toISOString()};
      writes.push({kind: "personal", state: structuredClone(personal.state)});
      return reply([{updated_at: personal.updated_at}]);
    }
    if (url.pathname.endsWith("/user_profiles")) return reply([{user_id: USER, username: "sequential_removal", display_name: "בדיקת מחיקה", avatar_preset: "avatar-1", updated_at: INITIAL}]);
    if (req.method() === "GET") return reply([]);
    return route.fulfill({headers, status: 204});
  });
  await page.addInitScript(({user, initial, space, key}) => {
    if (localStorage.getItem("qa-sequential-removal-seeded")) return;
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("settle-friends-account-session", JSON.stringify({access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user}));
    localStorage.setItem(`settle-friends-local-profile:account:${user.id}`, JSON.stringify({participantId: `account-${user.id}`, displayName: user.user_metadata.full_name, avatarPreset: "avatar-1", authProvider: "google", authSubject: user.id, email: user.email}));
    localStorage.setItem("settle-friends-cloud-space", space);
    localStorage.setItem(`settle-friends-cloud-key:${space}`, key);
    localStorage.setItem(`settle-friends-state:${space}`, JSON.stringify(initial));
    localStorage.setItem(`settle-friends-current-participant:account:${user.id}`, `account-${user.id}`);
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    localStorage.setItem("qa-sequential-removal-seeded", "1");
  }, {user, initial, space: SPACE, key: KEY});
  await page.goto("/");
  await expect(page.locator(`.event-row[data-event-id="${IDS[0]}"]`)).toBeVisible();
  return {firstStarted, releaseFirst, writes, errors, personal: () => personal.state, shared, eventIds};
}

async function requestRemoval(page, id) {
  await page.locator(`.event-row[data-event-id="${id}"] [data-action="event-status-select"]`).click();
  await page.locator('[data-action="remove-event-from-list"]').click();
  await expect(page.locator('[data-important-action-kind="delete-event"]')).toBeVisible();
}
const confirm = page => page.locator('[data-action="confirm-important-action"]').click();

test("pending deletion keeps the next event menu in back and forward navigation", async ({page}, testInfo) => {
  const h = await fixture(page, testInfo);
  try {
    await requestRemoval(page, IDS[0]); await confirm(page); await h.firstStarted.promise;
    await page.locator(`.event-row[data-event-id="${IDS[1]}"] [data-action="event-status-select"]`).click();
    await expect(page.locator(".event-status-menu")).toContainText("אירוע למחיקה 2");
    await page.goBack();
    await expect(page.locator(".event-status-menu")).toHaveCount(0);
    await page.goForward();
    await expect(page.locator(".event-status-menu")).toContainText("אירוע למחיקה 2");
    await page.locator('[data-action="remove-event-from-list"]').click();
    await expect(page.locator('[data-important-action-kind="delete-event"]')).toContainText("אירוע למחיקה 2");
    expect(h.errors).toEqual([]);
  } finally { h.releaseFirst.resolve(); }
});

test("three consecutive event deletions preserve the next confirmation, final writes and reload", async ({page}, testInfo) => {
  const h = await fixture(page, testInfo, {extraEvents: 36});
  const remainingIds = h.eventIds.slice(3).sort();
  try {
    await requestRemoval(page, IDS[0]); await confirm(page); await h.firstStarted.promise;
    await requestRemoval(page, IDS[1]); await confirm(page);
    await requestRemoval(page, IDS[2]);
    h.releaseFirst.resolve();
    await expect.poll(() => h.personal().deletedEvents?.map(item => item.id).sort()).toEqual(IDS.slice(0, 2).sort());
    await expect(page.locator('[data-important-action-kind="delete-event"]')).toContainText("אירוע למחיקה 3");
    await confirm(page);
    await expect.poll(() => h.personal().events.map(event => event.id).sort()).toEqual(remainingIds);
    await expect.poll(() => page.evaluate(space => localStorage.getItem(`settle-friends-pending-sync:${space}`), SPACE)).toBeNull();
    for (const id of IDS.slice(0, 3)) {
      expect(h.shared.get(`shared-${id}`).state.events).toEqual([]);
      expect(h.shared.get(`shared-${id}`).state.deletedEvents.map(item => item.id)).toEqual([id]);
    }
    await page.reload();
    await expect(page.locator(".event-row")).toHaveCount(remainingIds.length);
    await expect(page.locator(`.event-row[data-event-id="${IDS[3]}"]`)).toBeVisible();
    expect(h.errors).toEqual([]);
  } finally { h.releaseFirst.resolve(); }
});

test("a rejected earlier event deletion does not take over the next removal dialog", async ({page}, testInfo) => {
  const h = await fixture(page, testInfo, {firstStatus: 403});
  try {
    await requestRemoval(page, IDS[0]); await confirm(page); await h.firstStarted.promise;
    await requestRemoval(page, IDS[1]);
    h.releaseFirst.resolve();
    await expect.poll(() => page.evaluate(space => localStorage.getItem(`settle-friends-pending-sync:${space}`), SPACE)).toBeNull();
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "home");
    await expect(page.locator('[data-important-action-kind="delete-event"]')).toContainText("אירוע למחיקה 2");
    await confirm(page);
    await expect.poll(() => h.personal().events.map(event => event.id).sort()).toEqual([IDS[0], IDS[2], IDS[3]].sort());
    await expect(page.locator(`.event-row[data-event-id="${IDS[0]}"]`)).toBeVisible();
    expect(h.errors).toEqual([]);
  } finally { h.releaseFirst.resolve(); }
});
