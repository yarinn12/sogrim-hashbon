// Real production UI + Supabase, two disposable users, no auth/data injection.
// Management privileges are restricted to fixture setup and exact-manifest cleanup.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, webkit, devices, expect } from "@playwright/test";
import { loadEnvFile } from "../src/server/envFile.mjs";
import { signInWithPassword, accountProfileFromUser } from "../src/data/accountAuth.mjs";
import { saveCloudState, readCloudState } from "../src/data/cloudStore.mjs";
import { saveSharedEventState, refreshSharedEvents } from "../src/data/sharedEventStore.mjs";
import { assertQaAccount, assertQaSnapshot, summarizeMeasurements } from "./hourlyLiveQaSafety.mjs";
import { summarizeLiveFailure } from "./liveQaDiagnostics.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");
const localOrigin = process.argv.find(value => value.startsWith("--local-origin="))?.split("=").slice(1).join("=");
if (localOrigin) assert.match(localOrigin, /^http:\/\/127\.0\.0\.1:\d{4,5}$/, "Local QA must use an explicit loopback origin");
const origin = localOrigin || "https://sogrim-hesbon-app.vercel.app";
const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && anonKey && adminKey, "Live QA environment unavailable; do not create replacement credentials");
const outputRoot = resolve("work/hourly-two-user");
await mkdir(outputRoot, { recursive: true });
const lockPath = join(outputRoot, "active.json");
const cleanupOnly = process.argv.includes("--cleanup-only");
assert.ok(cleanupOnly || process.argv.includes("--allow-production"), "Use --allow-production only for authorized disposable-account production QA");
let fixture;
if (cleanupOnly) fixture = JSON.parse(await readFile(lockPath, "utf8"));
else {
  const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  fixture = { purpose: "hourly-two-user-v1", runId, accounts: [], spaceIds: [],
    eventId: `event-hourly-${runId}`, sharedId: `space-hourly-event-${runId}`, eventName: `QA hourly ${runId}` };
  const lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify(fixture));
  await lock.close();
}
assert.equal(fixture.purpose, "hourly-two-user-v1");
const report = { runId: fixture.runId, startedAt: new Date().toISOString(), origin,
  mode: `two real temporary users; ${localOrigin ? "local code" : "production UI"} and production backend; same computer/network`,
  status: "running", stages: [], measurements: [], requests: [], browserErrors: [],
  limitations: ["Not physical iPhone/iPad devices or two different networks", "No native push delivery test", "Fixture event setup uses normal client APIs; joining and tested mutations use UI", "Product analytics only are suppressed using the existing QA flag"] };
const browsers = [], pages = [], diagnostics = [];
let stage = "preflight";
const persist = () => writeFile(lockPath, JSON.stringify(fixture, null, 2));
const measurement = (name, kind, started) => report.measurements.push({ name, kind, ms: Math.round(performance.now() - started) });
const action = (page, name) => page.locator(`[data-action="${name}"]`).filter({ visible: true }).first();
const eventScreen = page => page.locator(`[data-screen-kind="event"][data-event-id="${fixture.eventId}"]`).first();
const config = account => ({ storage: { mode: "supabase", url, anonKey, table: "app_snapshots", spaceId: account.workspace.id,
  spaceKey: account.workspace.key, account: { userId: account.id, accessToken: account.session.access_token, spaceId: account.workspace.id } } });

async function admin(path, method = "GET", body) {
  const response = await fetch(url + path, { method, signal: AbortSignal.timeout(20_000),
    headers: { apikey: adminKey, authorization: `Bearer ${adminKey}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `QA management ${method} failed: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function createAccount(role) {
  const account = { role, email: `qa-hourly-${role}-${fixture.runId}@example.test`,
    workspace: { id: `space-hourly-${role}-${fixture.runId}`, key: randomBytes(32).toString("base64url") } };
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const user = await admin("/auth/v1/admin/users", "POST", { email: account.email, password, email_confirm: true,
    user_metadata: { full_name: `בודק שעתי ${role}`, username: `qa_h_${role}_${randomBytes(5).toString("hex")}`,
      account_space_id: account.workspace.id, account_space_key: account.workspace.key } });
  account.id = user.id;
  // The recovery manifest contains identifiers only, never passwords, tokens or workspace keys.
  fixture.accounts.push({ ...account, workspace: { id: account.workspace.id } });
  fixture.spaceIds.push(account.workspace.id);
  await persist();
  assertQaAccount(user, account, fixture.runId);
  account.password = password;
  account.session = await signInWithPassword({ storage: { mode: "supabase", url, anonKey } }, account);
  assert.equal(account.session.user.id, account.id);
  const profile = accountProfileFromUser(account.session.user);
  const state = { currentParticipantId: profile.participantId, participants: [{ id: profile.participantId,
    displayName: profile.displayName, username: profile.username, kind: "user", authProvider: profile.authProvider,
    authSubject: profile.authSubject, email: profile.email, accountLinked: true }], groups: [], events: [], deletedEvents: [], deletedParticipants: [] };
  await saveCloudState(config(account), state);
  return { account, state };
}
async function client(account, engine, device) {
  const browser = await engine.launch({ headless: true });
  browsers.push(browser);
  const context = await browser.newContext({ ...devices[device] });
  // No network interception, fake responses, injected auth, store imports or forced refreshes.
  await context.addInitScript(() => { window.__SOGRIM_AUTOMATED_QA__ = true; });
  context.on("page", observed => {
    observed.setDefaultTimeout(20_000);
    observed.on("pageerror", error => report.browserErrors.push({ role: account.role, message: error.message }));
  });
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(20_000);
  context.on("response", response => {
    const parsed = new URL(response.url());
    if (parsed.origin !== url && !(parsed.origin === origin && parsed.pathname.startsWith("/api/"))) return;
    const entry = { role: account.role, at: new Date().toISOString(), path: parsed.pathname, method: response.request().method(), status: response.status() };
    report.requests.push(entry);
    if (response.status() >= 400) diagnostics.push(response.json().then(payload => {
      entry.failure = summarizeLiveFailure(payload);
      if (parsed.pathname === "/rest/v1/rpc/update_shared_event_snapshot") {
        if (/^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(payload?.code ?? "")) entry.databaseCode = payload.code;
        if (/^[A-Za-z][A-Za-z -]{4,179}$/.test(payload?.message ?? "")) entry.databaseReason = payload.message;
      }
    }).catch(() => {}));
    if (parsed.pathname === "/rest/v1/rpc/update_shared_event_snapshot" && response.status() >= 400) {
      const payload = response.request().postDataJSON();
      const event = payload?.p_state?.events?.find(item => item.id === fixture.eventId);
      // Only structural QA fields; never credentials, full request payloads or auth responses.
      entry.attempt = event ? { eventId: event.id, members: event.participantIds, admins: event.adminIds,
        creator: event.createdByParticipantId, locked: event.locked, notes: event.notes?.length, expenses: event.expenses?.length,
        eventFields: Object.keys(event).sort(), currency: event.currency, eventType: event.eventType,
        adminsCanEditOnly: event.adminsCanEditOnly, roundSettlementTransfers: event.roundSettlementTransfers,
        directSettlementTransfers: event.directSettlementTransfers,
        participants: payload.p_state.participants.map(p => ({ id: p.id, displayName: p.displayName, username: p.username, accountLinked: p.accountLinked })) } : null;
    }
  });
  return page;
}
async function login(page, account, destination = origin) {
  const started = performance.now();
  await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const gate = page.locator("#public-account-auth-gate");
  await expect(gate).toBeVisible({ timeout: 30_000 });
  const toggle = gate.locator('[data-account-action="toggle-email"]');
  if (await toggle.isVisible()) await toggle.click();
  await gate.locator('input[name="email"]').fill(account.email);
  await gate.locator('input[name="password"]').fill(account.password);
  await gate.locator('button[type="submit"]').click();
  await expect(gate).toHaveCount(0, { timeout: 40_000 });
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  measurement(`login-${account.role}`, "startup", started);
}
async function openEvent(page) {
  const button = page.locator(`[data-action="open-event"][data-event-id="${fixture.eventId}"]`).first();
  // Invite login navigates straight to the event after its auth gate disappears.
  // Wait for either destination before deciding whether a navigation click is needed.
  await expect.poll(async () => await eventScreen(page).isVisible() || await button.isVisible()).toBe(true);
  if (!(await eventScreen(page).isVisible())) await button.click();
  await expect(eventScreen(page)).toBeVisible();
}
async function checkView(page, name) {
  assert.ok((await page.locator("#app").innerText()).trim().length > 0, "Blank application");
  assert.equal(await page.locator(".vite-error-overlay, [data-nextjs-dialog], #webpack-dev-server-client-overlay").count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
  await page.screenshot({ path: join(outputRoot, `${fixture.runId}-${name}.png`), fullPage: true });
}
async function step(name, run) {
  stage = name;
  console.log(JSON.stringify({ stage, status: "running" }));
  await run();
  report.stages.push({ name, status: "passed" });
}
async function cleanup() {
  const accountCount = fixture.accounts.length;
  // Read and validate every exact target before any deletion; no broad queries/deletes.
  for (const account of fixture.accounts) {
    const user = await admin(`/auth/v1/admin/users/${encodeURIComponent(account.id)}`);
    assertQaAccount(user, account, fixture.runId);
  }
  for (const id of fixture.spaceIds) {
    const rows = await admin(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(id)}&select=id,owner_user_id,snapshot_kind,state`);
    for (const row of rows) assertQaSnapshot(row, fixture);
  }
  for (const id of fixture.spaceIds) await admin(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(id)}`, "DELETE");
  for (const account of [...fixture.accounts]) {
    await admin(`/auth/v1/admin/users/${encodeURIComponent(account.id)}`, "DELETE");
    fixture.accounts = fixture.accounts.filter(item => item.id !== account.id);
    await persist();
  }
  await unlink(lockPath);
  report.cleanup = { status: "passed", deletedTemporaryAccounts: accountCount, snapshotTargets: fixture.spaceIds.length };
}

try {
  if (!cleanupOnly) {
    const liveConfig = await fetch(`${origin}/api/config`, { signal: AbortSignal.timeout(15_000) }).then(r => { assert.ok(r.ok); return r.json(); });
    assert.equal(liveConfig.storage.url.replace(/\/+$/, ""), url, "Operator environment does not match production");
    const html = await fetch(origin, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).then(r => r.text());
    report.release = html.match(/data-pwa-release="(\d+)"/)?.[1];
    assert.ok(report.release, "Production release marker missing");
    stage = "fixture-setup";
    const owner = await createAccount("a"), peer = await createAccount("b");
    const now = new Date().toISOString();
    owner.state.events = [{ id: fixture.eventId, name: fixture.eventName, eventType: "standard", currency: "ILS",
      participantIds: [owner.state.currentParticipantId], adminIds: [owner.state.currentParticipantId], createdByParticipantId: owner.state.currentParticipantId,
      adminsCanEditOnly: false, roundSettlementTransfers: false, locked: false, closedAt: null, createdAt: now, updatedAt: now,
      sharedSpaceId: fixture.sharedId, sharedSpaceKey: randomBytes(32).toString("base64url"), expenses: [], transfers: [], notes: [], deletedNotes: [], activityLog: [] }];
    fixture.spaceIds.push(fixture.sharedId);
    await persist();
    await saveCloudState(config(owner.account), owner.state);
    await saveSharedEventState(config(owner.account), owner.state, fixture.eventId);
    const inviteResponse = await fetch(`${origin}/api/event-invites/open-link`, { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${owner.account.session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ eventId: fixture.eventId, operation: "ensure", candidateToken: "" }) });
    assert.ok(inviteResponse.ok, `Invitation setup HTTP ${inviteResponse.status}`);
    const invite = await inviteResponse.json();
    assert.match(invite.token, /^[A-Za-z0-9_-]{32,128}$/);
    report.devices = ["Pixel 7 (Chromium)", new Date().getHours() % 2 ? "iPhone 15 (WebKit)" : "iPad Pro 11 (WebKit)"];
    const a = await client(owner.account, chromium, "Pixel 7");
    const b = await client(peer.account, webkit, report.devices[1].startsWith("iPhone") ? "iPhone 15" : "iPad Pro 11");
    await step("login-and-invite-join", async () => {
      await login(a, owner.account);
      await login(b, peer.account, `${origin}/i/${fixture.eventId}/t/${invite.token}`);
      await openEvent(a); await openEvent(b);
      await action(a, "open-event-participants").click();
      await expect(a.locator("#app")).toContainText("בודק שעתי b", { timeout: 20_000 });
      await action(a, "event-participants-back").click();
      await checkView(a, "owner-event"); await checkView(b, "peer-event");
    });
    const title = `בדיקת פתק ${fixture.runId}`, body = "נוצר אצל א", editedBody = "נערך אצל ב";
    await step("note-create-a-to-b", async () => {
      await action(a, "open-event-notes").click(); await action(b, "open-event-notes").click();
      await action(a, "new-event-note").click();
      await action(a, "event-note-title").fill(title); await action(a, "event-note-body").fill(body);
      const started = performance.now();
      await action(a, "save-event-note").click();
      await Promise.all([
        expect(a.locator(".event-note-modal")).toHaveCount(0).then(() => measurement("note-create-save-dialog", "save", started)),
        expect(b.locator(".event-note-open").filter({ hasText: title })).toContainText(body).then(() => measurement("note-create-a-to-b", "sync", started))
      ]);
    });
    await step("note-edit-b-to-a", async () => {
      await b.locator(".event-note-open").filter({ hasText: title }).click();
      await action(b, "event-note-body").fill(editedBody);
      const started = performance.now(); await action(b, "save-event-note").click();
      await Promise.all([
        expect(b.locator(".event-note-modal")).toHaveCount(0).then(() => measurement("note-edit-save-dialog", "save", started)),
        expect(a.locator(".event-note-open").filter({ hasText: title })).toContainText(editedBody).then(() => measurement("note-edit-b-to-a", "sync", started))
      ]);
      await checkView(b, "peer-notes");
    });
    await step("note-receiver-reopen", async () => {
      await b.close();
      const reopened = await pages[1].context().newPage(); pages[1] = reopened;
      reopened.setDefaultTimeout(20_000);
      await a.locator(".event-note-open").filter({ hasText: title }).click();
      await action(a, "event-note-body").fill("עודכן כשהצד השני סגור"); await action(a, "save-event-note").click();
      await expect(a.locator(".event-note-modal")).toHaveCount(0);
      const started = performance.now();
      await reopened.goto(origin, { waitUntil: "domcontentloaded" }); await openEvent(reopened);
      await action(reopened, "open-event-notes").click();
      await expect(reopened.locator(".event-note-open").filter({ hasText: title })).toContainText("עודכן כשהצד השני סגור");
      measurement("receiver-reopen-to-note", "startup", started);
    });
    const receiver = pages[1];
    await step("note-delete-b-to-a", async () => {
      await receiver.locator(".event-note-open").filter({ hasText: title }).click();
      await action(receiver, "request-delete-event-note").click();
      const started = performance.now(); await action(receiver, "confirm-important-action").click();
      await expect(a.locator(".event-note-open").filter({ hasText: title })).toHaveCount(0);
      measurement("note-delete-b-to-a", "sync", started);
      await expect(receiver.locator(".event-note-modal")).toHaveCount(0);
    });
    await step("expense-create-a-to-b", async () => {
      await action(a, "back-to-event").click(); await action(receiver, "back-to-event").click();
      await action(a, "show-expense-form").click();
      await action(a, "expense-total").fill("42.50"); await action(a, "expense-step-next").click();
      await action(a, "expense-name").fill(`QA expense ${fixture.runId}`); await action(a, "expense-step-next").click();
      await action(a, "expense-step-next").click(); await action(a, "expense-step-next").click();
      const started = performance.now(); await action(a, "save-expense").click();
      await Promise.all([
        expect(a.locator(".expense-step-modal")).toHaveCount(0).then(() => measurement("expense-create-save-dialog", "save", started)),
        expect(eventScreen(receiver)).toContainText(`QA expense ${fixture.runId}`).then(() => measurement("expense-create-a-to-b", "sync", started))
      ]);
      await expect(eventScreen(receiver)).toContainText("42.50");
      await checkView(receiver, "peer-expense");
    });
    await step("server-convergence", async () => {
      // Personal snapshots are indexes/caches, not the authority for shared
      // expenses. Use the same authenticated canonical reads as app startup.
      const states = await Promise.all([owner.account, peer.account].map(async account => {
        const personal = await readCloudState(config(account));
        const indexed = personal.events.find(event => event.id === fixture.eventId);
        assert.ok(indexed, `${account.role}: joined event missing from personal index`);
        assert.equal(indexed.notes.length, 0, `${account.role}: personal note projection`);
        assert.equal(indexed.deletedNotes.length, 1, `${account.role}: personal note deletion projection`);
        return refreshSharedEvents(config(account), personal);
      }));
      const events = states.map(state => state.events.find(event => event.id === fixture.eventId));
      for (const event of events) {
        assert.equal(event.notes.length, 0, "canonical notes"); assert.equal(event.deletedNotes.length, 1, "canonical note tombstone");
        assert.equal(event.expenses.length, 1, "canonical expense count"); assert.equal(event.expenses[0].total, 4250, "canonical expense amount");
        assert.equal(event.participantIds.length, 2);
      }
      for (const field of ["notes", "deletedNotes", "expenses", "participantIds"]) assert.deepEqual(events[0][field], events[1][field], `${field} not converged`);
      assert.deepEqual(report.browserErrors, [], "Unhandled browser errors");
    });
    report.status = "passed";
  } else report.status = "cleanup-only";
} catch (error) {
  report.status = "failed";
  report.failure = { stage, message: String(error.message).replace(/\/i\/[^\s]+/g, "/i/[redacted]").slice(0, 1500) };
  if (fixture.accounts.length === 2 && fixture.spaceIds.includes(fixture.sharedId)) {
    try {
      const rows = await admin(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(fixture.sharedId)}&select=id,owner_user_id,snapshot_kind,state`);
      for (const row of rows) assertQaSnapshot(row, fixture);
      report.canonicalAtFailure = rows.map(row => ({ id: row.id, events: row.state.events.map(event => ({
        id: event.id, members: event.participantIds, admins: event.adminIds, creator: event.createdByParticipantId,
        locked: event.locked, notes: event.notes?.length, expenses: event.expenses?.length
      })), participants: row.state.participants.map(p => ({ id: p.id, displayName: p.displayName, username: p.username, accountLinked: p.accountLinked })) }));
    } catch (diagnosticError) { report.canonicalDiagnostic = diagnosticError.message; }
  }
  for (const [index, page] of pages.entries()) if (!page.isClosed()) await page.screenshot({ path: join(outputRoot, `${fixture.runId}-failure-${index}.png`), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await Promise.allSettled(diagnostics);
  report.unexpectedHttpFailures = report.requests.filter(entry => entry.status >= 400 && !(
    entry.path === "/api/admin/overview" && entry.status === 403 ||
    entry.path === "/api/event-invites/redeem" && entry.status === 401 && entry.failure?.code === "EVENT_INVITE_AUTH_REQUIRED"
  ));
  if (report.status === "passed" && report.unexpectedHttpFailures.length) {
    report.status = "degraded";
    process.exitCode = 1;
  }
  for (const browser of browsers) await browser.close().catch(() => {});
  try { await cleanup(); }
  catch (error) { report.status = "failed"; report.cleanup = { status: "failed", message: error.message }; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  report.syncSummary = summarizeMeasurements(report.measurements);
  report.slowMeasurements = report.measurements.filter(x => x.kind === "save" ? x.ms > 1_500 : x.kind === "sync" && x.ms > 5_000);
  await writeFile(join(outputRoot, `${fixture.runId}.json`), JSON.stringify(report, null, 2));
  await writeFile(join(outputRoot, "latest.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, requests: { total: report.requests.length, failed: report.requests.filter(x => x.status >= 400) } }, null, 2));
}
