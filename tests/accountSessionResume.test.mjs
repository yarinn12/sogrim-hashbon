import test from "node:test";
import assert from "node:assert/strict";
import { resumeAfterAccountSessionRefresh } from "../src/accountSessionResume.mjs";

test("a refreshed account resumes sync even when runtime config refresh fails", async () => {
  const calls = [];
  const configFailure = new Error("config unavailable");

  await resumeAfterAccountSessionRefresh({
    refreshRuntimeConfig: async () => {
      calls.push("refresh-config");
      throw configFailure;
    },
    reportRefreshFailure: (error) => calls.push(["deferred", error]),
    requestResumeSync: async (options) => calls.push(["resume", options])
  });

  assert.deepEqual(calls, [
    "refresh-config",
    ["deferred", configFailure],
    ["resume", { force: true, includeSecondary: false }]
  ]);
});

test("a successful runtime config refresh happens before resume sync", async () => {
  const calls = [];
  await resumeAfterAccountSessionRefresh({
    refreshRuntimeConfig: async () => calls.push("refresh-config"),
    reportRefreshFailure: () => calls.push("unexpected-failure"),
    requestResumeSync: async () => calls.push("resume")
  });

  assert.deepEqual(calls, ["refresh-config", "resume"]);
});
