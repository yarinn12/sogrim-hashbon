import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { recordPersonalPinsCloudErrors } from "../e2e/helpers/personalPinsCloudErrors.mjs";

const origin = "https://personal-pins-qa.supabase.co";
const userId = "personal-pins-cloud-owner";
const inboxUrl = `${origin}/rest/v1/notification_inbox?recipient_user_id=eq.${userId}&limit=40`;
const fullInboxUrl = `${origin}/rest/v1/notification_inbox?recipient_user_id=eq.${userId}&select=id%2Cevent_id%2Cactivity_id%2Ckind%2Ctitle%2Cbody%2Cview%2Caction_url%2Ccreated_at%2Cread_at&order=created_at.desc&limit=40`;

function nativeDiagnostic(url = inboxUrl, stack = true) {
  const message = `Fetch API cannot load ${url} due to access control checks.`;
  const colon = message.indexOf(":");
  return { name: message.slice(0, colon), message: message.slice(colon + 2),
    stack: stack ? `${message}\n    at unknown (http://127.0.0.1:4182/src/data/fetchTimeout.mjs:40:23)` : message };
}
function probe(browserName = "webkit") {
  const page = new EventEmitter();
  const monitor = recordPersonalPinsCloudErrors(page, { origin, userId, browserName });
  return { page, ...monitor };
}
function request(url = inboxUrl) {
  return { url: () => url, failure: () => ({ errorText: "net::ERR_FAILED" }) };
}

test("an unissued native inbox diagnostic during the fixture's explicit reload is retained separately", async () => {
  const f = probe();
  await f.withReload(async () => f.page.emit("pageerror", nativeDiagnostic()));
  assert.deepEqual(f.errors, []);
  assert.equal(f.diagnostics.length, 1);
  assert.equal(f.diagnostics[0].reason, "webkit-document-replacement");
});

test("an issued old-document inbox GET cancelled by explicit reload needs a new-document read ACK", async () => {
  const page = new EventEmitter(), frame = {};
  page.documentId = "old-document";
  page.mainFrame = () => frame;
  page.evaluate = async () => page.documentId;
  const monitor = recordPersonalPinsCloudErrors(page, { origin, userId, browserName: "webkit" });
  const oldRead = { url: () => fullInboxUrl, method: () => "GET",
    failure: () => ({ errorText: "Load request cancelled" }) };
  const navigation = { url: () => "http://127.0.0.1:4182/", method: () => "GET",
    isNavigationRequest: () => true, frame: () => frame };
  const newRead = { url: () => fullInboxUrl, method: () => "GET" };
  await monitor.withReload(async () => {
    page.emit("request", oldRead);
    page.emit("requestfailed", oldRead);
    assert.equal(monitor.errors.length, 1, "the raw failure remains pending until the new read is acknowledged");
    page.emit("request", navigation);
    page.documentId = "new-document";
    page.emit("framenavigated", frame);
    page.emit("request", newRead);
    page.emit("response", { request: () => newRead, status: () => 200,
      headers: () => ({ "access-control-allow-origin": "*" }) });
    page.emit("requestfinished", newRead);
  }, { ready: async () => {} });
  assert.deepEqual(monitor.errors, []);
  assert.equal(monitor.diagnostics.length, 1);
  assert.equal(monitor.diagnostics[0].reason, "webkit-old-document-inbox-read-cancelled");
  assert.match(monitor.diagnostics[0].raw, /Load request cancelled/);
});

function issuedReload({ url = fullInboxUrl, method = "GET", failureText = "Load request cancelled",
  finalStatus = 200, finalRead = true, replaceDocument = true,
  finalAllowOrigin = "*", oldStatus, failAfterCommit = false,
  failAfterNewRead = false, browserName = "webkit" } = {}) {
  const page = new EventEmitter(), frame = {};
  page.documentId = "old-document";
  page.mainFrame = () => frame;
  page.evaluate = async () => page.documentId;
  const monitor = recordPersonalPinsCloudErrors(page, { origin, userId, browserName });
  const oldRequest = { url: () => url, method: () => method,
    failure: () => ({ errorText: failureText }) };
  const navigation = { url: () => "http://127.0.0.1:4182/", method: () => "GET",
    isNavigationRequest: () => true, frame: () => frame };
  const newRequest = { url: () => fullInboxUrl, method: () => "GET" };
  const run = () => monitor.withReload(async () => {
    page.emit("request", oldRequest);
    if (oldStatus) page.emit("response", { request: () => oldRequest, status: () => oldStatus,
      headers: () => ({ "access-control-allow-origin": "*" }) });
    if (!failAfterCommit && !failAfterNewRead) page.emit("requestfailed", oldRequest);
    page.emit("request", navigation);
    if (replaceDocument) page.documentId = "new-document";
    page.emit("framenavigated", frame);
    if (failAfterCommit) page.emit("requestfailed", oldRequest);
    if (finalRead) {
      page.emit("request", newRequest);
      page.emit("response", { request: () => newRequest, status: () => finalStatus,
        headers: () => ({ "access-control-allow-origin": finalAllowOrigin }) });
      page.emit("requestfinished", newRequest);
    }
    if (failAfterNewRead) page.emit("requestfailed", oldRequest);
  }, { ready: async () => {}, acknowledgementTimeoutMs: 50 });
  return { ...monitor, run };
}

test("a cancelled inbox GET cannot be cleared without a successful new-document ACK", async () => {
  for (const options of [{ finalRead: false }, { finalStatus: 503 }]) {
    const f = issuedReload(options);
    await assert.rejects(f.run());
    assert.equal(f.errors.length, 1);
    assert.deepEqual(f.diagnostics, []);
  }
});

test("a cancelled inbox GET cannot be cleared without a distinct ready document", async () => {
  const f = issuedReload({ replaceDocument: false });
  await assert.rejects(f.run(), /no verified replacement document/);
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.diagnostics, []);
});

test("write cancellations and real read failures remain errors across reload", async () => {
  for (const options of [
    { method: "PATCH" },
    { method: "PATCH", url: origin + "/rest/v1/app_snapshots?id=eq.space-owner" },
    { failureText: "net::ERR_FAILED" },
    { url: inboxUrl },
    { url: fullInboxUrl + "&unexpected=1" },
    { browserName: "chromium" },
    { oldStatus: 200 }
  ]) {
    const f = issuedReload(options);
    await f.run();
    assert.equal(f.errors.length, 1);
    assert.deepEqual(f.diagnostics, []);
  }
});

test("old-document cancellation after navigation commit still needs a later new read", async () => {
  const f = issuedReload({ failAfterCommit: true });
  await f.run();
  assert.deepEqual(f.errors, []);
  assert.equal(f.diagnostics.length, 1);
  assert.match(f.diagnostics[0].raw, /Load request cancelled/);
});

test("a late failure after the new read cannot be cleared by that earlier ACK", async () => {
  const f = issuedReload({ failAfterNewRead: true });
  await assert.rejects(f.run());
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.diagnostics, []);
});

test("a new inbox response without CORS acknowledgement cannot clear the old cancellation", async () => {
  const f = issuedReload({ finalAllowOrigin: null });
  await assert.rejects(f.run());
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.diagnostics, []);
});

test("an inbox cancellation before the explicit reload remains an error", async () => {
  const f = probe(), oldRequest = { url: () => fullInboxUrl, method: () => "GET",
    failure: () => ({ errorText: "Load request cancelled" }) };
  f.page.emit("request", oldRequest);
  f.page.emit("requestfailed", oldRequest);
  await f.withReload(async () => {});
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.diagnostics, []);
});

test("the same native inbox diagnostic outside reload remains an error", () => {
  const f = probe();
  f.page.emit("pageerror", nativeDiagnostic());
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.diagnostics, []);
});

test("an issued inbox request with a real failure still fails during reload", async () => {
  const f = probe(), issued = request();
  await f.withReload(async () => {
    f.page.emit("request", issued);
    f.page.emit("requestfailed", issued);
    f.page.emit("pageerror", nativeDiagnostic());
  });
  assert.equal(f.errors.length, 2);
  assert.deepEqual(f.diagnostics, []);
});

test("a failed inbox request before reload cannot be hidden by its late native diagnostic", async () => {
  const f = probe(), issued = request();
  f.page.emit("request", issued);
  f.page.emit("requestfailed", issued);
  await f.withReload(async () => f.page.emit("pageerror", nativeDiagnostic()));
  assert.equal(f.errors.length, 2);
  assert.deepEqual(f.diagnostics, []);
});

test("a real request failure arriving after the native diagnostic still fails", async () => {
  const f = probe(), issued = request();
  await f.withReload(async () => {
    f.page.emit("pageerror", nativeDiagnostic());
    f.page.emit("requestfailed", issued);
  });
  assert.equal(f.errors.length, 1);
});

test("runtime errors and unrelated access failures remain errors during reload", async () => {
  const f = probe();
  await f.withReload(async () => {
    f.page.emit("pageerror", new TypeError("Unable to save"));
    f.page.emit("pageerror", nativeDiagnostic(`${origin}/rest/v1/app_snapshots?id=eq.other`));
    f.page.emit("pageerror", nativeDiagnostic(`https://other.example/rest/v1/notification_inbox?recipient_user_id=eq.${userId}`));
    f.page.emit("pageerror", nativeDiagnostic(`${origin}/rest/v1/notification_inbox?recipient_user_id=eq.other`));
    f.page.emit("pageerror", nativeDiagnostic(inboxUrl, false));
  });
  assert.equal(f.errors.length, 5);
  assert.deepEqual(f.diagnostics, []);
});

test("Chromium cannot classify the WebKit diagnostic", async () => {
  const f = probe("chromium");
  await f.withReload(async () => f.page.emit("pageerror", nativeDiagnostic()));
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.diagnostics, []);
});
