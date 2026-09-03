import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLiveFailure, summarizeLiveRequest } from "../scripts/liveQaDiagnostics.mjs";

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
