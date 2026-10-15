import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { recordPersonalPinsCloudErrors } from "../e2e/helpers/personalPinsCloudErrors.mjs";

const origin = "https://personal-pins-qa.supabase.co";
const userId = "personal-pins-cloud-owner";
const inboxUrl = `${origin}/rest/v1/notification_inbox?recipient_user_id=eq.${userId}&limit=40`;

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
