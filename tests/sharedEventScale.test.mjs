import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSharedEventSyncSelection,
  refreshSharedEvents,
  syncSharedEvents
} from "../src/data/sharedEventStore.mjs";

test("a regular save syncs only the shared event that changed", () => {
  const previous = stateWithSharedEvents(80);
  const next = structuredClone(previous);
  next.events[42].name = "Changed event";
  next.events[42].updatedAt = "2026-08-05T12:01:00.000Z";

  assert.deepEqual(buildSharedEventSyncSelection(previous, next), {
    eventIds: ["event-43"],
    deletedEventIds: []
  });
});

test("selected shared-event sync avoids unchanged events and redundant membership RPCs", async () => {
  const state = stateWithSharedEvents(40);
  const requestedKeys = [];
  const membershipRequests = [];
  const fetchImpl = async (url, options) => {
    const key = options.headers["x-space-key"];
    if (url.includes("/rest/v1/rpc/join_shared_event")) {
      membershipRequests.push(JSON.parse(options.body));
      return jsonResponse({ status: "active" });
    }
    requestedKeys.push(key);
    if (url.includes("/rest/v1/rpc/update_shared_event_snapshot")) {
      return jsonResponse({
        status: "updated",
        updatedAt: "2026-08-05T12:01:00.000Z"
      });
    }
    const index = Number(key.match(/(\d+)$/)?.[1] ?? 1);
    const event = state.events[index - 1];
    const payload = {
      currentParticipantId: "",
      participants: state.participants,
      groups: [],
      events: [{
        ...event,
        sharedSpaceId: undefined,
        sharedSpaceKey: undefined
      }]
    };
    return {
      ok: true,
      async json() {
        return options.method
          ? [{ updated_at: "2026-08-05T12:01:00.000Z" }]
          : [{ state: payload, updated_at: "2026-08-05T12:00:00.000Z" }];
      }
    };
  };

  await syncSharedEvents(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon",
        account: {
          userId: "00000000-0000-4000-8000-000000000001",
          accessToken: "account-token"
        }
      }
    },
    state,
    fetchImpl,
    { eventIds: ["event-17"], deletedEventIds: [] }
  );

  assert.equal(requestedKeys.length, 2);
  assert.deepEqual(
    new Set(requestedKeys),
    new Set(["event-share-key-00000000000000017"])
  );
  assert.deepEqual(membershipRequests, []);
});

test("a large account refresh caps simultaneous shared-event reads", async () => {
  const state = stateWithSharedEvents(24);
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = async (_url, options) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    const key = options.headers["x-space-key"];
    const index = Number(key.match(/(\d+)$/)?.[1] ?? 1);
    const event = state.events[index - 1];
    return {
      ok: true,
      async json() {
        return [{
          state: {
            currentParticipantId: "",
            participants: state.participants,
            groups: [],
            events: [{
              ...event,
              sharedSpaceId: undefined,
              sharedSpaceKey: undefined
            }]
          },
          updated_at: "2026-08-05T12:00:00.000Z"
        }];
      }
    };
  };

  await refreshSharedEvents(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon"
      }
    },
    state,
    fetchImpl
  );

  assert.ok(maxInFlight > 1);
  assert.ok(maxInFlight <= 6, `observed ${maxInFlight} simultaneous reads`);
});

function stateWithSharedEvents(count) {
  const participants = [{ id: "person-1", displayName: "Person 1", kind: "user" }];
  return {
    currentParticipantId: "person-1",
    participants,
    groups: [],
    events: Array.from({ length: count }, (_, index) => ({
      id: `event-${index + 1}`,
      name: `Event ${index + 1}`,
      participantIds: ["person-1"],
      adminIds: ["person-1"],
      createdByParticipantId: "person-1",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
      expenses: [],
      transfers: [],
      sharedSpaceId: `event-space-${index + 1}`,
      sharedSpaceKey: `event-share-key-${String(index + 1).padStart(17, "0")}`
    })),
    deletedEvents: [],
    deletedParticipants: []
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
