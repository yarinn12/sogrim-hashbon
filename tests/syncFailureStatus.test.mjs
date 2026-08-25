import assert from "node:assert/strict";
import test from "node:test";

import {
  isTransientSyncFailure,
  syncFailureStatus
} from "../src/data/localStore.mjs";

test("sync failures distinguish the network from server and account errors", () => {
  assert.equal(syncFailureStatus(new Error("Failed to fetch"), true), "unavailable");
  assert.equal(
    syncFailureStatus(Object.assign(new Error("timed out"), { code: "NETWORK_TIMEOUT" }), true),
    "unavailable"
  );
  assert.equal(
    syncFailureStatus(Object.assign(new Error("server failed"), { status: 500 }), true),
    "unavailable"
  );
  assert.equal(
    syncFailureStatus(Object.assign(new Error("session expired"), {
      code: "CLOUD_STATE_AUTH_EXPIRED",
      status: 401
    }), true),
    "unavailable"
  );
});

test("wrapped shared-event failures preserve their real cause", () => {
  const conflict = Object.assign(new Error("conflict"), {
    code: "CLOUD_STATE_CONFLICT"
  });
  const wrappedConflict = Object.assign(new Error("shared event failed"), {
    code: "SHARED_EVENT_SYNC_FAILED",
    cause: conflict,
    failures: [conflict]
  });
  assert.equal(syncFailureStatus(wrappedConflict, true), "conflict");

  const serverFailure = Object.assign(new Error("shared event failed"), {
    code: "SHARED_EVENT_SYNC_FAILED",
    cause: Object.assign(new Error("forbidden"), { status: 403 })
  });
  assert.equal(syncFailureStatus(serverFailure, true), "unavailable");
  assert.equal(syncFailureStatus(serverFailure, false), "offline");
});

test("write conflicts stay queued as transient failures instead of rolling back", () => {
  const conflict = Object.assign(new Error("conflict"), {
    code: "CLOUD_STATE_CONFLICT"
  });
  const wrappedConflict = Object.assign(new Error("shared event failed"), {
    code: "SHARED_EVENT_SYNC_FAILED",
    cause: conflict,
    failures: [conflict]
  });
  const forbidden = Object.assign(new Error("forbidden"), { status: 403 });

  assert.equal(isTransientSyncFailure(conflict), true);
  assert.equal(isTransientSyncFailure(wrappedConflict), true);
  assert.equal(isTransientSyncFailure(forbidden), false);
});
