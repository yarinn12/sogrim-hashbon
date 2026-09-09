import { expect } from "@playwright/test";

// A synthetic account workspace served through the real cloud read/write APIs.
// Pin preferences remain device-local; no production credentials or data are used.
export async function personalPinsCloud(page, baseURL, initialState) {
  const userId = "personal-pins-cloud-owner", participantId = `account-${userId}`;
  const space = "personal-pins-cloud-space", key = "synthetic-personal-pins-key-123456";
  const origin = "https://personal-pins-qa.supabase.co";
  const state = JSON.parse(JSON.stringify(initialState).replaceAll(initialState.currentParticipantId, participantId));
  const user = { id: userId, email: "personal-pins@example.test", app_metadata: { provider: "google" },
    user_metadata: { full_name: "בודק נעיצות", username: "personal_pins", account_space_id: space, account_space_key: key } };
  let current = { id: space, state, updated_at: "2026-09-03T08:00:00.000Z" };
  const reads = [], writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-space-key",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.route("**/api/config", route => route.fulfill({ json: {
    publicUrl: baseURL, storage: { mode: "supabase", url: origin, anonKey: "synthetic-anon", table: "app_snapshots" }
  } }));
  await page.route(`${origin}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (request.method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
    if (url.pathname === "/auth/v1/user") return reply(user);
    if (url.pathname.endsWith("/rpc/ensure_account_workspace")) return reply({ status: "existing", workspaceId: space });
    if (url.pathname.endsWith("/app_snapshots")) {
      if (request.method() === "GET") {
        if (url.searchParams.has("snapshot_kind")) return reply([]);
        expect(url.searchParams.get("id")).toBe(`eq.${space}`);
        const fields = (url.searchParams.get("select") || "id,state,updated_at").split(",");
        reads.push(structuredClone(current));
        return reply([Object.fromEntries(fields.map(field => [field, current[field]]))]);
      }
      const payload = request.postDataJSON();
      expect(url.searchParams.get("id") === `eq.${space}` || payload.id === space).toBe(true);
      current = { ...current, state: structuredClone(payload.state), updated_at: payload.updated_at || new Date().toISOString() };
      writes.push(structuredClone(current));
      return reply([{ updated_at: current.updated_at }]);
    }
    if (url.pathname.endsWith("/user_profiles")) return reply([{ user_id: userId, username: "personal_pins", display_name: "בודק נעיצות", avatar_preset: "avatar-1", updated_at: "2026-09-03T08:00:00.000Z" }]);
    if (request.method() === "GET") return reply([]);
    return route.fulfill({ headers, status: 204 });
  });
  await page.addInitScript(({ user, state, space, key, participantId }) => {
    if (!localStorage.getItem("qa-cloud-pins-seeded")) {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
      localStorage.setItem(`settle-friends-local-profile:account:${user.id}`, JSON.stringify({ participantId, displayName: "בודק נעיצות", avatarPreset: "avatar-1", authProvider: "google", authSubject: user.id, email: user.email }));
      localStorage.setItem("settle-friends-cloud-space", space);
      localStorage.setItem(`settle-friends-cloud-key:${space}`, key);
      localStorage.setItem(`settle-friends-state:${space}`, JSON.stringify(state));
      localStorage.setItem(`settle-friends-current-participant:account:${user.id}`, participantId);
      localStorage.setItem("qa-cloud-pins-seeded", "1");
    }
    sessionStorage.setItem("settle-friends-skip-next-splash", "1");
  }, { user, state, space, key, participantId });
  await page.goto("/");
  await expect(page.locator(".event-row")).toHaveCount(state.events.length);
  return { reads, writes, errors, state: () => structuredClone(current.state),
    update: next => { current = { ...current, state: structuredClone(next), updated_at: new Date().toISOString() }; } };
}
