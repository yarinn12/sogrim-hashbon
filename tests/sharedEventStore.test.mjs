import test from "node:test";
import assert from "node:assert/strict";

import {
  attachSharedEventCredentials,
  buildSharedEventState,
  ensureSharedEventMembership,
  ensureEventShareCredentials,
  eventShareCredentials,
  mergeSharedEventIntoState,
  recoverAccessibleSharedEvents,
  refreshSharedEvents,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";

test("membership recovery rebuilds a missing personal event index", async () => {
  const runtimeConfig = {
    storage: {
      mode: "supabase",
      url: "https://project.supabase.co",
      table: "app_snapshots",
      anonKey: "anon",
      spaceId: "personal-space",
      spaceKey: "personal_space_key_1234567890123456",
      account: { userId: "user-one", accessToken: "account-token" }
    }
  };
  const empty = { currentParticipantId: "account-user-one", participants: [], events: [] };
  const recovered = await recoverAccessibleSharedEvents(
    runtimeConfig,
    empty,
    async () => ({
      ok: true,
      json: async () => [{
        id: "shared-event-korea",
        updated_at: "2026-08-24T10:00:00.000Z",
        state: {
          currentParticipantId: "",
          participants: [{ id: "account-user-one", displayName: "משתמש" }],
          groups: [],
          events: [{
            id: "event-korea",
            name: "קוריאה",
            participantIds: ["account-user-one"],
            expenses: []
          }]
        }
      }]
    })
  );

  assert.equal(recovered.events[0].name, "קוריאה");
  assert.equal(recovered.events[0].sharedSpaceId, "shared-event-korea");
});

test("shared-event membership is verified with the signed-in account before writes", async () => {
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
  assert.equal("x-space-key" in requests[0].options.headers, false);
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

test("a new shared event is created atomically with its authenticated owner", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000011";
  const participantId = `account-${accountUserId}`;
  const credentials = {
    id: "event-space-created",
    key: "event-share-key-created-1234567890123456"
  };
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Creator", accountLinked: true }],
    groups: [],
    events: [{
      id: "event-created",
      name: "Created safely",
      participantIds: [participantId],
      inactiveParticipantIds: [],
      adminIds: [participantId],
      createdByParticipantId: participantId,
      expenses: [],
      transfers: [],
      sharedSpaceId: credentials.id,
      sharedSpaceKey: credentials.key
    }]
  };
  const sharedState = buildSharedEventState(state, "event-created");
  const requests = [];
  let readCount = 0;

  const saved = await saveSharedEventState(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon",
        account: { userId: accountUserId, accessToken: "account-token" }
      }
    },
    state,
    "event-created",
    async (url, options = {}) => {
      requests.push({ url, options });
      if (url.includes("/rpc/create_shared_event_snapshot")) {
        return {
          ok: true,
          status: 200,
          async json() { return { status: "created" }; }
        };
      }
      readCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return readCount === 1
            ? []
            : [{ state: sharedState, updated_at: "2026-08-16T00:00:00.000Z" }];
        }
      };
    }
  );

  const creation = requests.find(({ url }) =>
    url.includes("/rpc/create_shared_event_snapshot")
  );
  assert.ok(creation);
  assert.equal(creation.options.headers.authorization, "Bearer account-token");
  assert.deepEqual(JSON.parse(creation.options.body), {
    p_snapshot_id: credentials.id,
    p_space_key: credentials.key,
    p_state: sharedState
  });
  assert.equal(saved.events[0].sharedSpaceId, credentials.id);
  assert.equal(saved.events[0].sharedSpaceKey, credentials.key);
  assert.equal(
    requests.some(({ url, options }) =>
      !url.includes("/rpc/") && options.method === "POST"
    ),
    false
  );
});

test("shared event payload carries only participant merges relevant to that event", () => {
  const payload = buildSharedEventState(
    {
      participants: [
        { id: "kept-user", displayName: "Kept", accountLinked: true },
        { id: "other-user", displayName: "Other", accountLinked: true }
      ],
      groups: [],
      events: [
        {
          id: "event-1",
          participantIds: ["kept-user"],
          adminIds: ["kept-user"],
          expenses: [],
          transfers: []
        }
      ],
      deletedParticipants: [
        {
          id: "stale-guest",
          deletedAt: "2026-08-15T01:00:00.000Z",
          reason: "merged",
          targetParticipantId: "kept-user"
        },
        {
          id: "unrelated-guest",
          deletedAt: "2026-08-15T01:00:00.000Z",
          reason: "merged",
          targetParticipantId: "other-user"
        }
      ]
    },
    "event-1"
  );

  assert.deepEqual(payload.deletedParticipants, [
    {
      id: "stale-guest",
      deletedAt: "2026-08-15T01:00:00.000Z",
      reason: "merged",
      targetParticipantId: "kept-user"
    }
  ]);
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

test("incoming participant merge removes a stale offline duplicate from the event", () => {
  const localState = {
    currentParticipantId: "stale-guest",
    participants: [
      { id: "kept-user", displayName: "Kept", accountLinked: true },
      { id: "stale-guest", displayName: "Old offline name", kind: "guest" }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["kept-user", "stale-guest"],
        adminIds: ["kept-user"],
        expenses: [],
        transfers: []
      }
    ]
  };
  const incoming = {
    currentParticipantId: "",
    participants: [
      { id: "kept-user", displayName: "Kept", accountLinked: true }
    ],
    groups: [],
    events: [
      {
        id: "event-1",
        participantIds: ["kept-user"],
        adminIds: ["kept-user"],
        expenses: [],
        transfers: []
      }
    ],
    deletedParticipants: [
      {
        id: "stale-guest",
        deletedAt: "2026-08-15T01:00:00.000Z",
        reason: "merged",
        targetParticipantId: "kept-user"
      },
      {
        id: "unrelated-guest",
        deletedAt: "2026-08-15T01:00:00.000Z",
        reason: "merged",
        targetParticipantId: "unrelated-user"
      }
    ]
  };

  const merged = mergeSharedEventIntoState(localState, incoming, {
    id: "space-event-one",
    key: "event_share_key_12345678901234567890"
  });

  assert.deepEqual(merged.participants.map((participant) => participant.id), [
    "kept-user"
  ]);
  assert.equal(merged.currentParticipantId, "kept-user");
  assert.deepEqual(merged.events[0].participantIds, ["kept-user"]);
  assert.deepEqual(merged.deletedParticipants, [
    {
      id: "stale-guest",
      deletedAt: "2026-08-15T01:00:00.000Z",
      reason: "merged",
      targetParticipantId: "kept-user"
    }
  ]);
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

test("refresh removes retained credentials when server membership was revoked", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000009";
  const participantId = `account-${accountUserId}`;
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Removed member" }],
    groups: [],
    events: [{
      id: "event-revoked",
      name: "Former event",
      participantIds: [participantId],
      inactiveParticipantIds: [],
      expenses: [],
      transfers: [],
      sharedSpaceId: "event-space-revoked",
      sharedSpaceKey: "event-share-key-revoked-123456789012345"
    }]
  };
  const refreshed = await refreshSharedEvents(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon",
        account: { userId: accountUserId, accessToken: "account-token" }
      }
    },
    state,
    async (url) => url.includes("/rpc/join_shared_event")
      ? { ok: false, status: 403 }
      : { ok: true, status: 200, async json() { return []; } }
  );

  const event = refreshed.events[0];
  assert.deepEqual(event.inactiveParticipantIds, [participantId]);
  assert.equal(event.sharedSpaceId, undefined);
  assert.equal(event.sharedSpaceKey, undefined);
});

test("an empty shared read does not revoke a membership the server still verifies", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000010";
  const participantId = `account-${accountUserId}`;
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Active member" }],
    groups: [],
    events: [{
      id: "event-active",
      participantIds: [participantId],
      inactiveParticipantIds: [],
      expenses: [],
      transfers: [],
      sharedSpaceId: "event-space-active",
      sharedSpaceKey: "event-share-key-active-1234567890123456"
    }]
  };
  const refreshed = await refreshSharedEvents(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon",
        account: { userId: accountUserId, accessToken: "account-token" }
      }
    },
    state,
    async (url) => url.includes("/rpc/join_shared_event")
      ? { ok: true, status: 200 }
      : { ok: true, status: 200, async json() { return []; } }
  );

  assert.deepEqual(refreshed, state);
});
