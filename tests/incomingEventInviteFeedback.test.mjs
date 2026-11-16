import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseInviteEventId, parseInviteToken } from "../src/domain/inviteLinks.mjs";
import { pendingInviteUrl } from "../src/data/pendingInvite.mjs";

const sourceRoot = process.env.INCOMING_INVITE_TEST_SOURCE_DIR ||
  resolve(import.meta.dirname, "..");
const app = readFileSync(resolve(sourceRoot, "src/app.mjs"), "utf8");
const importer = readFileSync(resolve(sourceRoot, "src/publicInviteSnapshotLayer.mjs"), "utf8");
const auth = readFileSync(resolve(sourceRoot, "src/publicAccountAuthLayer.mjs"), "utf8");
const eventId = "event-invite-feedback-audit";
const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
const rememberedUrl = `https://example.invalid/?event=${eventId}&t=${token}`;
const visibleUrl = `https://example.invalid/?event=${eventId}`;

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("a retained token waits for the actual redeem result instead of claiming the event is missing", () => {
  const session = storage();
  const durable = storage();
  session.setItem("sogrim-pending-invite-url", rememberedUrl);
  const context = vm.createContext({
    window: { location: { href: visibleUrl } },
    URL,
    parseInviteEventId,
    parseInviteToken,
    pendingInviteUrl: (url) => pendingInviteUrl(url, session, durable),
    getEvent: () => null,
    screen: { name: "home" },
    notice: ""
  });
  vm.runInContext(functionSource(app, "openInvitedEventFromUrl"), context);
  context.openInvitedEventFromUrl();
  assert.equal(context.notice, "", "a pending redeem must not become a not-found result");
  session.removeItem("sogrim-pending-invite-url");
  durable.removeItem("sogrim-pending-invite-handoff-v1");
  context.openInvitedEventFromUrl();
  assert.equal(context.notice, "קישור ההזמנה לא נמצא.");
});

function importHarness() {
  let generation = 0;
  let activeOwner = "owner-a";
  const notices = [];
  const requests = [];
  const config = { storage: { account: { userId: "owner-a" } } };
  const context = vm.createContext({
    window: { location: { href: visibleUrl, origin: "https://example.invalid" } },
    URL,
    parseInviteEventId,
    pendingInviteUrl: () => rememberedUrl,
    versionedReadCacheSessionGeneration: () => generation,
    inviteImportOwnerIsActive: () => activeOwner === config.storage.account.userId,
    resolveEventInviteCredentials: () => new Promise((resolveRequest, rejectRequest) => {
      requests.push({ resolveRequest, rejectRequest });
    }),
    document: { dispatchEvent: (event) => notices.push(event.detail.message) },
    CustomEvent: class { constructor(_type, options) { this.detail = options.detail; } }
  });
  const start = importer.indexOf("async function importIncomingSharedEvent(");
  const end = importer.indexOf("\nfunction notifyJoinedEvent(", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(importer.slice(start, end), context);
  return {
    notices,
    requests,
    import: (options = {}) => context.importIncomingSharedEvent(config, rememberedUrl, options),
    changeGeneration: () => { generation += 1; },
    switchAccount: () => { activeOwner = "owner-b"; }
  };
}

const unavailable = () => Object.assign(new Error("upstream unavailable"), {
  code: "EVENT_INVITES_UNAVAILABLE",
  status: 503,
  retryable: true
});

test("initial temporary redeem failure reports a retryable reason without accepting membership", async () => {
  const h = importHarness();
  const result = h.import({ reportTemporaryFailure: true });
  h.requests[0].rejectRequest(unavailable());
  assert.equal(await result, false);
  assert.deepEqual(h.notices, ["ההזמנות אינן זמינות כרגע. כדאי לנסות שוב בעוד רגע."]);
  const retry = h.import();
  h.requests[1].rejectRequest(unavailable());
  assert.equal(await retry, false);
  assert.equal(h.notices.length, 1, "background retries must not repeat the same notice");
});

for (const change of ["changeGeneration", "switchAccount"]) {
  test(`a stale redeem failure after ${change} cannot notify the new account`, async () => {
    const h = importHarness();
    const result = h.import({ reportTemporaryFailure: true });
    h[change]();
    h.requests[0].rejectRequest(unavailable());
    assert.equal(await result, false);
    assert.deepEqual(h.notices, []);
  });
}

test("terminal invitation rejection does not claim a temporary outage", async () => {
  const h = importHarness();
  const result = h.import({ reportTemporaryFailure: true });
  h.requests[0].rejectRequest(Object.assign(new Error("expired"), {
    code: "EVENT_INVITE_EXPIRED",
    status: 410,
    retryable: false
  }));
  assert.equal(await result, false);
  assert.deepEqual(h.notices, []);
});

function noticeDeliveryHarness() {
  const values = storage();
  const callbacks = [];
  const notices = [];
  let locked = false;
  let storedOwner = "owner-a";
  const context = vm.createContext({
    ACCOUNT_NOTICE_MARKER: "notice",
    APP_NOTICE_EVENT: "settle-friends:notice",
    appContentReady: true,
    accountSyncReloadScheduled: false,
    pendingAccountNoticeDeliveryTimer: null,
    accountSession: { user: { id: "owner-a" } },
    sessionValue: (key) => values.getItem(key),
    removeSessionValue: (key) => values.removeItem(key),
    loadStoredAccountSession: () => ({ user: { id: storedOwner } }),
    document: {
      documentElement: { classList: { contains: () => locked } },
      dispatchEvent: (event) => notices.push(event.detail.message)
    },
    window: { setTimeout: (callback) => { callbacks.push(callback); return callbacks.length; } },
    CustomEvent: class { constructor(_type, options) { this.detail = options.detail; } }
  });
  vm.runInContext(functionSource(auth, "deliverPendingAccountNotice"), context);
  return {
    context,
    values,
    callbacks,
    notices,
    lock: () => { locked = true; },
    unlock: () => { locked = false; },
    switchAccount: () => {
      storedOwner = "owner-b";
      context.accountSession = { user: { id: "owner-b" } };
    }
  };
}

test("a saved invitation error is delivered once after the account content is ready", () => {
  const h = noticeDeliveryHarness();
  h.values.setItem("notice", "תוקף קישור ההצטרפות פג. צריך לבקש קישור חדש.");
  h.lock();
  h.context.deliverPendingAccountNotice();
  assert.equal(h.callbacks.length, 0);
  assert.ok(h.values.getItem("notice"), "a locked gate must not consume the notice");
  h.unlock();
  h.context.deliverPendingAccountNotice();
  h.context.deliverPendingAccountNotice();
  assert.equal(h.callbacks.length, 1, "repeated ready events must not queue duplicates");
  assert.ok(h.values.getItem("notice"), "the notice stays durable until delivery");
  h.callbacks[0]();
  assert.deepEqual(h.notices, ["תוקף קישור ההצטרפות פג. צריך לבקש קישור חדש."]);
  assert.equal(h.values.getItem("notice"), null);
  h.context.deliverPendingAccountNotice();
  assert.equal(h.callbacks.length, 1);
});

test("a queued invitation error is discarded when another account takes over", () => {
  const h = noticeDeliveryHarness();
  h.values.setItem("notice", "ההזמנה הפרטית נשלחה לחשבון אחר.");
  h.context.deliverPendingAccountNotice();
  h.switchAccount();
  h.callbacks[0]();
  assert.deepEqual(h.notices, []);
  assert.equal(h.values.getItem("notice"), null);
});
