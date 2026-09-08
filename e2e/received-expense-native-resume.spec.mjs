import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const receiver = "11111111-1111-4111-8111-111111111111";
const sender = "22222222-2222-4222-8222-222222222222";
const eventId = "received-expense-event", spaceId = "receiver-workspace", sharedId = "canonical-expense-event";
const spaceKey = "fixture-only-key-abcdefghijklmnopqrstuvwxyz";
const origin = "https://received-expense-fixture.supabase.co";
const headers = { "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-space-key",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };

for (const scenario of ["cold-personal-replica", "native-return-during-read", "native-resume-burst",
  "online-return-home", "online-return-open-event"]) {
  test(`receiver sees canonical expenses with ${scenario}`, async ({ page, context }, testInfo) => {
    const stamp = new Date().toISOString();
    const participants = [receiver, sender].map((id, index) => ({ id: `account-${id}`,
      displayName: index ? "משתמש שולח" : "משתמש מקבל", kind: "user", accountLinked: true,
      avatarPreset: "avatar-1", profileUpdatedAt: stamp }));
    const initial = { currentParticipantId: `account-${receiver}`, participants, groups: [], friendContacts: [],
      events: [{ id: eventId, name: "בדיקת הוצאה שהתקבלה", eventType: "standard", currency: "ILS",
        participantIds: participants.map(p => p.id), adminIds: [participants[0].id],
        createdByParticipantId: participants[0].id, createdAt: stamp, locked: false,
        sharedSpaceId: sharedId, sharedSpaceKey: spaceKey, expenses: [], transfers: [], notes: [] }] };
    let personal = { id: spaceId, state: structuredClone(initial), updated_at: stamp };
    const shared = { id: sharedId, state: structuredClone(initial), updated_at: stamp };
    shared.state.currentParticipantId = "";
    delete shared.state.events[0].sharedSpaceId; delete shared.state.events[0].sharedSpaceKey;
    let sequence = 0;
    function addPeerExpense() {
      const updatedAt = new Date(Date.now() + ++sequence * 1000).toISOString();
      shared.state.events[0].expenses.push({ id: `peer-expense-${sequence}`, name: `כרטיסי בדיקה ${sequence}`,
        total: 7000, payers: [{ participantId: `account-${sender}`, amount: 7000 }],
        sharedByParticipantIds: participants.map(p => p.id), createdByParticipantId: `account-${sender}`,
        updatedAt, kind: "shared" });
      shared.updated_at = updatedAt;
    }
    if (scenario === "cold-personal-replica") addPeerExpense();
    const user = { id: receiver, email: "receiver@example.test", app_metadata: { provider: "google" },
      user_metadata: { full_name: participants[0].displayName, username: "fixture_receiver",
        account_space_id: spaceId, account_space_key: spaceKey } };
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    let holdNextIndex = false, held = false, metadataIndexes = 0, inFlightIndexes = 0;
    let networkDown = false, rejectedOfflineRequests = 0;
    const indexReads = [];
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(testInfo.project.use.baseURL).origin ? route.continue() : route.abort());
    await page.route("**/api/config", route => route.fulfill({ json: {
      publicUrl: testInfo.project.use.baseURL, storage: { mode: "supabase", url: origin, anonKey: "fixture-anon", table: "app_snapshots" }
    } }));
    await page.route(`${origin}/**`, async route => {
      if (networkDown) { rejectedOfflineRequests++; return route.abort("internetdisconnected"); }
      const request = route.request(), url = new URL(request.url());
      const reply = json => route.fulfill({ headers, json });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (url.pathname.endsWith("/ensure_account_workspace")) return reply({ status: "existing", workspaceId: spaceId });
      if (url.pathname.endsWith("/join_shared_event")) return reply(true);
      if (url.pathname.endsWith("/user_profiles")) return reply(participants.map((p, index) => ({
        user_id: index ? sender : receiver, display_name: p.displayName,
        username: index ? "fixture_sender" : "fixture_receiver", avatar_preset: "avatar-1",
        avatar_image: null, avatar_image_updated_at: null, updated_at: stamp
      })));
      if (url.pathname.endsWith("/update_shared_event_snapshot")) {
        const body = request.postDataJSON();
        shared.state = structuredClone(body.p_state); shared.updated_at = new Date().toISOString();
        return reply({ status: "updated", updatedAt: shared.updated_at });
      }
      if (url.pathname.endsWith("/app_snapshots")) {
        if (request.method() !== "GET") {
          const body = request.postDataJSON();
          personal = { id: spaceId, state: structuredClone(body.state), updated_at: body.updated_at || new Date().toISOString() };
          return reply([{ updated_at: personal.updated_at }]);
        }
        const fields = (url.searchParams.get("select") || "id,state,updated_at").split(",");
        const isIndex = url.searchParams.has("snapshot_kind");
        const row = isIndex || url.searchParams.get("id") === `eq.${sharedId}` ? shared : personal;
        const rows = structuredClone([Object.fromEntries(fields.map(field => [field, row[field]]))]);
        if (isIndex) {
          indexReads.push({ at: Date.now(), fields, version: row.updated_at });
          inFlightIndexes++;
          if (!fields.includes("state")) metadataIndexes++;
          try {
            if (holdNextIndex) { holdNextIndex = false; held = true; await gate; }
            return await reply(rows);
          } finally { inFlightIndexes--; }
        }
        return reply(rows);
      }
      return request.method() === "GET" ? reply([]) : route.fulfill({ headers, status: 204 });
    });
    await page.addInitScript(({ user, initial, spaceId, spaceKey }) => {
      window.__syncProbeOnlineEvents = 0;
      window.addEventListener("online", () => window.__syncProbeOnlineEvents++);
      localStorage.setItem("settle-friends-account-session", JSON.stringify({ access_token: "fixture-token",
        refresh_token: "fixture-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
      localStorage.setItem("settle-friends-cloud-space", spaceId);
      localStorage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
      localStorage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(initial));
      localStorage.setItem(`settle-friends-current-participant:account:${user.id}`, `account-${user.id}`);
      localStorage.setItem(`settle-friends-local-profile:account:${user.id}`, JSON.stringify({
        participantId: `account-${user.id}`, displayName: user.user_metadata.full_name,
        username: user.user_metadata.username, avatarPreset: "avatar-1", authProvider: "google", authSubject: user.id, email: user.email
      }));
      sessionStorage.setItem("settle-friends-skip-next-splash", "1");
    }, { user, initial, spaceId, spaceKey });
    const storedExpenseCount = () => page.evaluate(({ spaceId, eventId }) => {
      const stored = JSON.parse(localStorage.getItem(`settle-friends-state:${spaceId}`));
      return stored?.events?.find(event => event.id === eventId)?.expenses?.length ?? 0;
    }, { spaceId, eventId });
    try {
      await page.goto("/");
      await expect(page.locator('[data-screen-kind="home"]')).toBeVisible();
      if (scenario === "native-return-during-read" || scenario === "native-resume-burst") {
        // Wait for the first normal foreground poll; the next periodic account
        // scan is 15 seconds away and cannot accidentally satisfy this check.
        // Preparation only: Home scans every 15 seconds, and a foreground
        // read during startup can consume the first polling opportunity.
        // This is not the recovery deadline, which remains four seconds.
        await expect.poll(() => metadataIndexes, { timeout: 20_000 }).toBeGreaterThan(0);
        await expect.poll(() => inFlightIndexes).toBe(0);
        holdNextIndex = true;
        await page.evaluate(() => window.dispatchEvent(new CustomEvent("settle-friends:native-resume")));
        await expect.poll(() => held).toBe(true);
        addPeerExpense();
        const started = performance.now();
        await page.evaluate(count => {
          for (let index = 0; index < count; index++) {
            window.dispatchEvent(new CustomEvent("settle-friends:native-resume"));
          }
        }, scenario === "native-resume-burst" ? 20 : 1);
        release();
        await expect.poll(storedExpenseCount, { timeout: 4_000 }).toBe(1);
        console.log(JSON.stringify({ scenario, device: testInfo.project.name, receiveMs: Math.round(performance.now() - started) }));
      } else if (scenario.startsWith("online-return-")) {
        await expect.poll(() => metadataIndexes, { timeout: 20_000 }).toBeGreaterThan(0);
        await expect.poll(() => inFlightIndexes).toBe(0);
        if (scenario === "online-return-open-event") {
          await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
          await expect(page.locator('[data-action="open-event-notes"]')).toBeVisible();
        }
        networkDown = true;
        await context.setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        addPeerExpense();
        // Keep the page foregrounded: reconnect alone must recover, without
        // a native-return signal, manual refresh, navigation, or a pending save.
        await page.waitForTimeout(250);
        expect(await storedExpenseCount()).toBe(0);
        const started = performance.now();
        const reconnectedAt = Date.now();
        networkDown = false;
        await context.setOffline(false);
        await expect.poll(() => page.evaluate(() => window.__syncProbeOnlineEvents)).toBeGreaterThan(0);
        try {
          await expect.poll(storedExpenseCount, { timeout: 4_000 }).toBe(1);
        } catch (error) {
          const diagnostic = { scenario, targetMs: 4_000, storedExpensesAtDeadline: await storedExpenseCount(),
            canonicalExpenses: shared.state.events[0].expenses.length,
            connectivity: await page.evaluate(() => ({ online: navigator.onLine,
              onlineEvents: window.__syncProbeOnlineEvents })),
            indexReadsAfterReconnectAtDeadline: indexReads.filter(read => read.at >= reconnectedAt) };
          await page.screenshot({ path: testInfo.outputPath("reconnect-deadline.png"), fullPage: true });
          // Diagnostic only: keep the 4-second assertion failing even if a
          // later periodic poll eventually catches up. Never relax the target.
          try {
            await expect.poll(storedExpenseCount, { timeout: 20_000 }).toBe(1);
            diagnostic.eventualReceiveMs = Math.round(performance.now() - started);
          } catch { diagnostic.eventualReceiveMs = null; }
          diagnostic.indexReadsAfterReconnect = indexReads.filter(read => read.at >= reconnectedAt);
          await testInfo.attach("reconnect-diagnostic", { body: JSON.stringify(diagnostic, null, 2), contentType: "application/json" });
          console.log(JSON.stringify({ diagnostic: "reconnect-deadline-failure", ...diagnostic }));
          throw error;
        }
        console.log(JSON.stringify({ scenario, device: testInfo.project.name,
          receiveMs: Math.round(performance.now() - started), rejectedOfflineRequests }));
      } else {
        await expect.poll(storedExpenseCount).toBe(1);
      }
      if (scenario !== "online-return-open-event") {
        await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();
      }
      await expect(page.locator('.expense-row[data-expense-id="peer-expense-1"]')).toContainText("כרטיסי בדיקה 1");
      const started = performance.now();
      addPeerExpense();
      await expect(page.locator('.expense-row[data-expense-id="peer-expense-2"]')).toBeVisible({ timeout: 4_000 });
      console.log(JSON.stringify({ scenario: "open-event-peer-expense", device: testInfo.project.name, receiveMs: Math.round(performance.now() - started) }));
      await expect.poll(storedExpenseCount).toBe(2);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("received-expenses.png"), fullPage: true });
    } finally { release(); networkDown = false; await context.setOffline(false); }
  });
}
