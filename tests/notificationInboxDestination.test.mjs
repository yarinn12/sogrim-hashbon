import test from "node:test";
import assert from "node:assert/strict";

import { notificationInboxDestination } from "../src/domain/notificationInboxDestination.mjs";

const eventId = "event-notification-route";

test("every supported notification kind resolves to the surface described by its message", () => {
  const cases = [
    ["expense-created", "event", "expense"],
    ["participant-joined", "event", "participants"],
    ["event-invite", "event", "event"],
    ["event-closed", "settlement", "summary"],
    ["payment-reminder", "settlement", "transfer"],
    ["event-reopened", "event", "event"]
  ];

  for (const [kind, name, surface] of cases) {
    assert.deepEqual(
      notificationInboxDestination({
        kind,
        eventId,
        activityId: "entity-1",
        view: kind === "event-invite" ? "summary" : "event"
      }),
      { name, surface, eventId, entityId: "entity-1" },
      kind
    );
  }
});

test("friend requests and legacy notifications keep safe useful destinations", () => {
  assert.deepEqual(
    notificationInboxDestination({ kind: "friend-request" }),
    { name: "groups", tab: "requests", surface: "friend-requests" }
  );
  assert.deepEqual(
    notificationInboxDestination({ kind: "legacy", eventId, view: "summary" }),
    { name: "settlement", surface: "summary", eventId, entityId: "" }
  );
  assert.equal(notificationInboxDestination({ kind: "legacy" }), null);
});
