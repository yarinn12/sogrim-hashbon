import test from "node:test";
import assert from "node:assert/strict";

import {
  attachSharedEventCredentials,
  buildSharedEventState,
  ensureSharedEventMembership,
  ensureEventShareCredentials,
  eventShareCredentials,
  mergeSharedEventIntoState,
  refreshSharedEvents
} from "../src/data/sharedEventStore.mjs";

test("shared-event membership is registered with the signed-in account before writes", async () => {
  const requests = [];
  const runtimeConfig = {
    storage: {
      mode: "supabase",
      url: "https://project.supabase.co",
      anonKey: "anon",
      account: {
        userId: "00000000-0000-4000-8000-000000000001",
        accessToken: "account-token"
      }
    }
  };

  const registered = await ensureSharedEventMembership(
    runtimeConfig,
    {
      id: "event-space-one",
      key: "event_share_key_12345678901234567890"
    },
    async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    }
  );

  assert.equal(registered, true);
  assert.equal(
    requests[0].url,
    "https://project.supabase.co/rest/v1/rpc/join_shared_event"
  );
  assert.equal(requests[0].options.headers.authorization, "Bearer account-token");
  assert.equal(
    requests[0].options.headers["x-space-key"],
    "event_share_key_12345678901234567890"
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_snapshot_id: "event-space-one"
  });
});

test("a removed shared-event member cannot silently fall back to the old key", async () => {
  await assert.rejects(
    ensureSharedEventMembership(
      {
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon",
          account: {
            userId: "00000000-0000-4000-8000-000000000001",
            accessToken: "account-token"
          }
        }
      },
      {
        id: "event-space-one",
        key: "event_share_key_12345678901234567890"
      },
      async () => ({ ok: false, status: 403 })
    ),
    (error) =>
      error.code === "SHARED_EVENT_MEMBERSHIP_REVOKED" && error.status === 403
  );
});

test("invite credentials stay attached when the first cloud read is unavailable", () => {
  const state = {
    currentParticipantId: "local",
    participants: [{ id: "local", displayName: "Local" }],
    groups: [],
    events: [{
      id: "event-1",
      participantIds: ["local"],
      expenses: [],
      transfers: []
    }]
  };
  const credentials = {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  };

  const attached = attachSharedEventCredentials(state, "event-1", credentials);

  assert.notEqual(attached, state);
  assert.deepEqual(eventShareCredentials(attached.events[0]), credentials);
  assert.equal(eventShareCredentials(state.events[0]), null);
});

test("event sharing creates credentials that are separate from the account workspace", () => {
  const event = { id: "event-1" };

  const credentials = ensureEventShareCredentials(event, {
    createId: () => "space-event-one",
    createKey: () => "event_share_key_12345678901234567890"
  });

  assert.deepEqual(credentials, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });
  assert.deepEqual(eventShareCredentials(event), credentials);
});

test("shared event payload contains only the selected event and its people", () => {
  const payload = buildSharedEventState(
    {
      participants: [
        {
          id: "a",
          displayName: "A",
          avatarPreset: "avatar-2",
          email: "private@example.com",
          authProvider: "google",
          authSubject: "private-google-subject"
        },
        { id: "b", displayName: "B" },
        { id: "private", displayName: "Private" }
      ],
      groups: [{ id: "private-group", name: "Private group" }],
      events: [
        {
          id: "event-1",
          name: "Shared",
          participantIds: ["a", "b"],
          adminIds: ["a"],
          expenses: [],
          transfers: [],
          groupId: "private-group",
          sharedSpaceId: "space-event-one",
          sharedSpaceKey: "event_share_key_12345678901234567890"
        },
        {
          id: "private-event",
          name: "Private",
          participantIds: ["private"],
          expenses: [],
          transfers: []
        }
      ]
    },
    "event-1"
  );

  assert.deepEqual(payload.events.map((event) => event.id), ["event-1"]);
  assert.deepEqual(payload.participants.map((participant) => participant.id), ["a", "b"]);
  assert.deepEqual(payload.groups, []);
  assert.equal(payload.participants[0].email, undefined);
  assert.equal(payload.participants[0].authSubject, undefined);
  assert.equal(payload.participants[0].accountLinked, true);
  assert.equal(payload.participants[0].avatarPreset, "avatar-2");
  assert.equal(payload.participants[1].accountLinked, false);
  assert.equal(payload.events[0].groupId, undefined);
  assert.equal(payload.events[0].sharedSpaceKey, undefined);
});

test("incoming event data cannot inject unrelated events into the account", () => {
  const localState = {
    currentParticipantId: "local",
    participants: [{ id: "local", displayName: "Local" }],
    groups: [{ id: "local-group", name: "Local group" }],
    events: [{ id: "local-event", participantIds: ["local"], expenses: [], transfers: [] }]
  };
  const incoming = {
    currentParticipantId: "attacker",
    participants: [
      { id: "a", displayName: "A" },
      { id: "hidden", displayName: "Hidden" }
    ],
    groups: [{ id: "injected-group", name: "Injected" }],
    events: [
      { id: "event-1", participantIds: ["a"], adminIds: [], expenses: [], transfers: [] },
      { id: "injected-event", participantIds: ["hidden"], expenses: [], transfers: [] }
    ]
  };

  const merged = mergeSharedEventIntoState(localState, incoming, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });

  assert.equal(merged.currentParticipantId, "local");
  assert.deepEqual(merged.events.map((event) => event.id), ["event-1", "local-event"]);
  assert.deepEqual(merged.groups, localState.groups);
  assert.deepEqual(merged.participants.map((participant) => participant.id), ["a", "local"]);
  assert.equal(merged.events[0].sharedSpaceId, "space-event-one");
});

test("a shared event deletion removes a stale local copy and keeps retry credentials", () => {
  const localState = {
    currentParticipantId: "local",
    participants: [{ id: "local", displayName: "Local" }],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["local"],
        expenses: [],
        transfers: []
      }
    ]
  };
  const incoming = {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: [],
    deletedEvents: [
      { id: "event-1", deletedAt: "2026-07-19T15:00:00.000Z" }
    ]
  };

  const merged = mergeSharedEventIntoState(localState, incoming, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });

  assert.deepEqual(merged.events, []);
  assert.equal(merged.currentParticipantId, "local");
  assert.deepEqual(merged.deletedEvents, [
    {
      id: "event-1",
      deletedAt: "2026-07-19T15:00:00.000Z",
      sharedSpaceId: "space-event-one",
      sharedSpaceKey: "event_share_key_12345678901234567890"
    }
  ]);
});

test("shared events refresh concurrently without losing remote updates", async () => {
  const keys = {
    "event-share-key-11111111111111111111": {
      id: "event-1",
      name: "Remote one"
    },
    "event-share-key-22222222222222222222": {
      id: "event-2",
      name: "Remote two"
    }
  };
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = async (_url, options) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const event = keys[options.headers["x-space-key"]];
    inFlight -= 1;
    return {
      ok: true,
      async json() {
        return [{
          state: {
            currentParticipantId: "",
            participants: [{ id: "a", displayName: "A" }],
            groups: [],
            events: [{
              ...event,
              participantIds: ["a"],
              adminIds: ["a"],
              expenses: [],
              transfers: []
            }]
          },
          updated_at: "2026-07-24T12:00:00.000Z"
        }];
      }
    };
  };
  const state = {
    currentParticipantId: "a",
    participants: [{ id: "a", displayName: "A" }],
    groups: [],
    events: [
      {
        id: "event-1",
        name: "Local one",
        participantIds: ["a"],
        expenses: [],
        transfers: [],
        sharedSpaceId: "event-space-one",
        sharedSpaceKey: "event-share-key-11111111111111111111"
      },
      {
        id: "event-2",
        name: "Local two",
        participantIds: ["a"],
        expenses: [],
        transfers: [],
        sharedSpaceId: "event-space-two",
        sharedSpaceKey: "event-share-key-22222222222222222222"
      }
    ]
  };

  const refreshed = await refreshSharedEvents(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_state",
        anonKey: "anon"
      }
    },
    state,
    fetchImpl
  );

  assert.equal(maxInFlight, 2);
  assert.deepEqual(
    Object.fromEntries(refreshed.events.map((event) => [event.id, event.name])),
    {
      "event-1": "Remote one",
      "event-2": "Remote two"
    }
  );
});
