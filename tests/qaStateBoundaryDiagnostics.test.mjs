import test from "node:test";
import assert from "node:assert/strict";
import { recordQaStateBoundary } from "../e2e-parity/helpers/qaStateBoundaryDiagnostics.mjs";

function response(status, body, requestId = "qa-ack") {
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    headers: () => ({ "x-sogrim-request-id": requestId }),
    text: async () => JSON.stringify(body)
  };
}

function evidenceSink() {
  const attachments = [];
  return {
    attachments,
    testInfo: { attach: async (name, value) => attachments.push({ name, value: JSON.parse(value.body) }) }
  };
}

const base = { scenario: "compact-320-default", engine: "chromium" };

test("reset and state writes retain separate status, acknowledged body and request ids", async () => {
  const { attachments, testInfo } = evidenceSink();
  const calls = [];
  const request = {
    post: async (path, options) => {
      calls.push({ path, options });
      return response(200, { events: [], participants: [] }, options.headers["x-sogrim-request-id"]);
    },
    put: async (path, options) => {
      calls.push({ path, options });
      return response(200, { ok: true }, options.headers["x-sogrim-request-id"]);
    }
  };
  await recordQaStateBoundary({ request, testInfo, ...base,
    phase: "reset", method: "post", path: "/api/reset" });
  await recordQaStateBoundary({ request, testInfo, ...base,
    phase: "state", method: "put", path: "/api/state", data: { synthetic: true } });
  assert.deepEqual(calls.map(call => call.path), ["/api/reset", "/api/state"]);
  assert.deepEqual(attachments.map(item => [item.value.phase, item.value.status]), [["reset", 200], ["state", 200]]);
  assert.deepEqual(attachments[0].value.body, { json: true, events: 0, participants: 0 });
  assert.deepEqual(attachments[1].value.body, { json: true, ok: true, code: "", error: "" });
  assert.equal(attachments[1].value.responseRequestId, calls[1].options.headers["x-sogrim-request-id"]);
  assert.deepEqual(calls[1].options.data, { synthetic: true });
  assert.ok(attachments.every(item => item.value.startedAt && item.value.finishedAt && item.value.durationMs >= 0));
});

test("a socket failure is not retried and keeps the original error with a bounded health probe", async () => {
  const { attachments, testInfo } = evidenceSink();
  const socketError = new Error("socket hang up");
  let resets = 0;
  let health = 0;
  const request = {
    post: async () => { resets++; throw socketError; },
    get: async (path, options) => {
      health++;
      assert.equal(path, "/api/health");
      assert.equal(options.timeout, 2_000);
      return response(200, { ok: true, storageMode: "local" });
    }
  };
  await assert.rejects(recordQaStateBoundary({ request, testInfo, ...base,
    phase: "reset", method: "post", path: "/api/reset" }), error => error === socketError);
  assert.equal(resets, 1);
  assert.equal(health, 1);
  assert.equal(attachments.length, 1);
  assert.match(attachments[0].value.failure.message, /socket hang up/);
  assert.deepEqual(attachments[0].value.health.body, { json: true, ok: true, storageMode: "local" });
});

test("an HTTP success without a state-write ACK still fails and records the response", async () => {
  const { attachments, testInfo } = evidenceSink();
  const request = {
    put: async () => response(200, { ok: false, code: "REJECTED" }),
    get: async () => response(200, { ok: true, storageMode: "local" })
  };
  await assert.rejects(recordQaStateBoundary({ request, testInfo, ...base,
    phase: "state", method: "put", path: "/api/state", data: {} }),
  /state write did not acknowledge ok:true/);
  assert.equal(attachments[0].value.status, 200);
  assert.deepEqual(attachments[0].value.body, { json: true, ok: false, code: "REJECTED", error: "" });
});

test("an invalid reset body cannot silently satisfy the QA boundary", async () => {
  const { attachments, testInfo } = evidenceSink();
  const request = {
    post: async () => response(200, { ok: true }),
    get: async () => response(200, { ok: true, storageMode: "local" })
  };
  await assert.rejects(recordQaStateBoundary({ request, testInfo, ...base,
    phase: "reset", method: "post", path: "/api/reset" }),
  /reset did not acknowledge a state snapshot/);
  assert.equal(attachments[0].value.status, 200);
});
