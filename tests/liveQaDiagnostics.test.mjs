import test from "node:test";
import assert from "node:assert/strict";
import { liveRequestTiming, summarizeLiveFailure, summarizeLiveRequest } from "../scripts/liveQaDiagnostics.mjs";

test("live diagnostics retain classification without response or credential contents", () => {
  assert.deepEqual(summarizeLiveFailure({
    code: "EVENT_INVITES_UNAVAILABLE", stage: "membership", retryable: true,
    upstreamStatus: 409, upstreamCode: "40001", spaceKey: "secret",
    access_token: "token", requestBody: "password", error: "private note text"
  }), {
    code: "EVENT_INVITES_UNAVAILABLE", stage: "membership", retryable: true,
    upstreamStatus: 409, upstreamCode: "40001"
  });
  assert.deepEqual(summarizeLiveFailure(null), {});
  assert.deepEqual(summarizeLiveFailure({ stage: "token", code: "private text",
    upstreamStatus: 999, upstreamCode: "password", retryable: "true" }), {});
});

test("live request timing separates queue delay, headers and full response", () => {
  assert.deepEqual(summarizeLiveRequest({
    path: "/rest/v1/app_snapshots", method: "POST", status: 200,
    startedAt: 1_100, headersAt: 1_400, finishedAt: 1_500,
    body: "secret"
  }, 1_000), {
    path: "/rest/v1/app_snapshots", method: "POST", status: 200,
    startedAfterMs: 100, headersAfterMs: 300, completedAfterMs: 400
  });
});

test("network timing comes from the browser even when observer events arrive late", () => {
  assert.deepEqual(liveRequestTiming({ startTime: 10_100, responseStart: 250, responseEnd: 270 },
    999, 10_000), { startedAt: 100, headersAt: 350, finishedAt: 370 });
});

test("unavailable browser timings are unknown, not near-zero network latency", () => {
  const entry = liveRequestTiming({ startTime: -1, responseStart: -1, responseEnd: -1 }, 500, 10_000);
  const summary = summarizeLiveRequest(entry, 400);
  assert.equal(summary.startedAfterMs, 100);
  assert.equal(summary.headersAfterMs, null);
  assert.equal(summary.completedAfterMs, null);
});
