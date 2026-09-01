import test from "node:test";
import assert from "node:assert/strict";

import {
  attachSharedEventCredentials,
  buildSharedEventSyncSelection,
  buildSharedEventState,
  ensureSharedEventMembership,
  ensureEventShareCredentials,
  eventShareCredentials,
  mergeSharedEventIntoState,
  recoverAccessibleSharedEvents,
  readSharedEventStateIfChanged,
  refreshSharedEvents,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import { RECOVERED_MEMBER_SPACE_KEY } from "../src/data/cloudStore.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";

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

test("active event polling downloads the shared state only after its version changes", async () => {
  const runtimeConfig = {
    storage: {
      mode: "supabase",
      url: "https://project.supabase.co",
      table: "app_snapshots",
      anonKey: "anon",
      account: { userId: "user-one", accessToken: "account-token" }
    }
  };
  const credentials = {
    id: "shared-event-versioned",
    key: "shared_event_version_key_123456789012345"
  };
  const sharedState = {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: [{ id: "event-versioned", participantIds: [], expenses: [] }]
  };
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (requests.length === 1) {
      return jsonResponse([{ state: sharedState, updated_at: "2026-08-31T11:00:00.000Z" }]);
    }
    return jsonResponse([{ updated_at: "2026-08-31T11:00:00.000Z" }]);
  };

  const initial = await readSharedEventStateIfChanged(
    runtimeConfig,
    credentials,
    "event-versioned",
    fetchImpl
  );
  const unchanged = await readSharedEventStateIfChanged(
    runtimeConfig,
    credentials,
    "event-versioned",
    fetchImpl
  );

  assert.equal(initial.changed, true);
  assert.deepEqual(initial.state, sharedState);
  assert.deepEqual(unchanged, { changed: false, missing: false, state: null });
  assert.equal(requests.length, 2);
  assert.match(requests[0], /select=state,updated_at$/);
  assert.match(requests[1], /select=updated_at$/);
});

test("membership recovery removes a locally retained event that is no longer accessible", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000014";
  const participantId = `account-${accountUserId}`;
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Former member" }],
    groups: [],
    events: [{
      id: "event-no-longer-accessible",
      participantIds: [participantId],
      inactiveParticipantIds: [],
      expenses: [],
      sharedSpaceId: "shared-event-no-longer-accessible",
      sharedSpaceKey: "shared_event_removed_key_123456789012345"
    }]
  };

  const recovered = await recoverAccessibleSharedEvents(
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
    async () => jsonResponse([])
  );

  assert.deepEqual(recovered.events[0].inactiveParticipantIds, [participantId]);
  assert.equal(recovered.events[0].sharedSpaceId, undefined);
  assert.equal(recovered.events[0].sharedSpaceKey, undefined);
});

test("membership recovery restores the signed-in member inside a stale personal event", () => {
  const participantId = "account-user-one";
  const recovered = mergeSharedEventIntoState(
    {
      currentParticipantId: participantId,
      participants: [
        { id: participantId, displayName: "משתמש" },
        { id: "account-user-two", displayName: "חבר" }
      ],
      groups: [],
      events: [{
        id: "event-korea",
        participantIds: ["account-user-two"],
        inactiveParticipantIds: [],
        membershipUpdatedAtByParticipant: {
          [participantId]: "2026-08-28T18:30:00.000Z"
        },
        expenses: [],
        transfers: []
      }]
    },
    {
      participants: [
        { id: participantId, displayName: "משתמש" },
        { id: "account-user-two", displayName: "חבר" }
      ],
      groups: [],
      events: [{
        id: "event-korea",
        participantIds: ["account-user-two", participantId],
        inactiveParticipantIds: [],
        membershipUpdatedAtByParticipant: {
          [participantId]: "2026-08-28T18:20:00.000Z"
        },
        expenses: [],
        transfers: []
      }]
    },
    {
      id: "shared-event-korea",
      key: "event_share_key_12345678901234567890"
    }
  );

  assert.ok(recovered.events[0].participantIds.includes(participantId));
  assert.ok(!recovered.events[0].inactiveParticipantIds.includes(participantId));
  assert.equal(recovered.currentParticipantId, participantId);
});

test("membership recovery never replaces an event's existing raw credentials", async () => {
  const rawCredentials = {
    id: "shared-event-owned",
    key: "owned_event_key_123456789012345678901234"
  };
  const state = {
    currentParticipantId: "account-user-one",
    participants: [{ id: "account-user-one", displayName: "משתמש" }],
    groups: [],
    events: [{
      id: "event-owned",
      name: "אירוע מקומי",
      participantIds: ["account-user-one"],
      expenses: [],
      transfers: [],
      sharedSpaceId: rawCredentials.id,
      sharedSpaceKey: rawCredentials.key
    }]
  };
  const rows = [
    {
      id: rawCredentials.id,
      state: {
        participants: state.participants,
        groups: [],
        events: [{ ...state.events[0], name: "אירוע מעודכן" }]
      }
    },
    {
      id: "stale-duplicate-space",
      state: {
        participants: state.participants,
        groups: [],
        events: [{ ...state.events[0], name: "עותק ישן" }]
      }
    }
  ];

  const recovered = await recoverAccessibleSharedEvents(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon",
        account: { userId: "user-one", accessToken: "account-token" }
      }
    },
    state,
    async () => ({ ok: true, json: async () => rows })
  );

  assert.equal(recovered.events[0].name, "אירוע מעודכן");
  assert.deepEqual(eventShareCredentials(recovered.events[0]), rawCredentials);
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
          avatarImage: "https://images.example.com/new-avatar.webp",
          profileUpdatedAt: "2026-08-25T10:15:00.000Z",
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
  assert.equal(
    payload.participants[0].avatarImage,
    "https://images.example.com/new-avatar.webp"
  );
  assert.equal(
    payload.participants[0].profileUpdatedAt,
    "2026-08-25T10:15:00.000Z"
  );
  assert.equal(payload.participants[1].accountLinked, false);
  assert.equal(payload.events[0].groupId, undefined);
  assert.equal(payload.events[0].sharedSpaceKey, undefined);
});

test("shared event serialization keeps deleted accounts as strict tombstones", () => {
  const participantId = "account-00000000-0000-4000-8000-000000000001";
  const payload = buildSharedEventState({
    participants: [{
      id: participantId,
      displayName: "שם ישן",
      kind: "user",
      accountDeleted: true,
      avatarImage: "data:image/jpeg;base64,private",
      avatarPreset: "avatar-3",
      accountLinked: true,
      email: "private@example.com",
      profileUpdatedAt: "2026-08-31T10:00:00.000Z"
    }],
    events: [{
      id: "event-deleted-account",
      participantIds: [participantId],
      adminIds: [participantId],
      expenses: [],
      transfers: []
    }]
  }, "event-deleted-account");

  assert.deepEqual(payload.participants, [{
    id: participantId,
    displayName: "משתמש שנמחק",
    kind: "user",
    accountDeleted: true
  }]);
});

test("a newer profile image crosses the shared-event snapshot and wins on another device", () => {
  const event = {
    id: "event-profile-sync",
    participantIds: ["account-user-one"],
    expenses: [],
    transfers: [],
    sharedSpaceId: "space-profile-sync",
    sharedSpaceKey: "event_share_key_12345678901234567890"
  };
  const remotePayload = buildSharedEventState(
    {
      participants: [{
        id: "account-user-one",
        displayName: "Profile Owner",
        avatarImage: "https://images.example.com/new-avatar.webp",
        profileUpdatedAt: "2026-08-25T10:15:00.000Z",
        accountLinked: true
      }],
      events: [event]
    },
    event.id
  );
  const staleDevice = {
    currentParticipantId: "account-user-two",
    participants: [{
      id: "account-user-one",
      displayName: "Profile Owner",
      avatarImage: "https://images.example.com/old-avatar.webp",
      profileUpdatedAt: "2026-08-24T10:15:00.000Z",
      accountLinked: true
    }],
    groups: [],
    events: [event]
  };

  const merged = mergeSharedStates(remotePayload, staleDevice);

  assert.equal(
    merged.participants[0].avatarImage,
    "https://images.example.com/new-avatar.webp"
  );
  assert.equal(
    merged.participants[0].profileUpdatedAt,
    "2026-08-25T10:15:00.000Z"
  );
});

test("an expired account session is not treated as revoked event membership", async () => {
  await assert.rejects(
    ensureSharedEventMembership(
      {
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          anonKey: "anon",
          account: {
            userId: "00000000-0000-4000-8000-000000000001",
            accessToken: "expired-account-token"
          }
        }
      },
      {
        id: "event-space-one",
        key: "event_share_key_12345678901234567890"
      },
      async () => ({ ok: false, status: 401 })
    ),
    (error) => error.code === "CLOUD_STATE_AUTH_EXPIRED" && error.status === 401
  );
});

test("a one-time profile repair republishes every shared event that references the account", () => {
  const event = {
    id: "event-profile-repair",
    participantIds: ["account-user-one", "account-user-two"],
    expenses: [],
    transfers: [],
    sharedSpaceId: "space-profile-repair",
    sharedSpaceKey: "event_share_key_12345678901234567890"
  };
  const state = {
    participants: [{ id: "account-user-one", displayName: "Profile Owner" }],
    events: [event]
  };

  assert.deepEqual(buildSharedEventSyncSelection(state, state), {
    eventIds: [],
    deletedEventIds: []
  });
  assert.deepEqual(
    buildSharedEventSyncSelection(state, state, {
      forceParticipantIds: ["account-user-one"]
    }),
    { eventIds: [event.id], deletedEventIds: [] }
  );
  assert.deepEqual(
    buildSharedEventSyncSelection(state, state, {
      forceEventIds: [event.id]
    }),
    { eventIds: [event.id], deletedEventIds: [] }
  );
});

test("a regular member save never republishes another participant profile", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000022";
  const actorId = `account-${accountUserId}`;
  const ownerId = "account-00000000-0000-4000-8000-000000000021";
  const credentials = {
    id: "event-space-member-profile-boundary",
    key: "event-share-key-member-profile-boundary-123456"
  };
  const event = {
    id: "event-member-profile-boundary",
    name: "Profile boundary",
    participantIds: [ownerId, actorId],
    inactiveParticipantIds: [],
    adminIds: [ownerId],
    createdByParticipantId: ownerId,
    expenses: [],
    transfers: []
  };
  const remote = {
    currentParticipantId: "",
    participants: [
      {
        id: ownerId,
        displayName: "Remote Owner",
        kind: "user",
        avatarPreset: "avatar-1",
        accountLinked: true
      },
      {
        id: actorId,
        displayName: "Member Name",
        kind: "user",
        avatarPreset: "avatar-2",
        accountLinked: true
      }
    ],
    groups: [],
    events: [event],
    deletedParticipants: []
  };
  const local = {
    currentParticipantId: actorId,
    participants: [
      {
        id: ownerId,
        displayName: "Forged Owner",
        kind: "user",
        avatarPreset: "avatar-6",
        accountLinked: true,
        profileUpdatedAt: "2026-08-25T21:10:33.941Z"
      },
      {
        id: actorId,
        displayName: "Updated Member",
        kind: "user",
        avatarPreset: "avatar-3",
        accountLinked: true,
        profileUpdatedAt: "2026-08-26T08:00:00.000Z"
      }
    ],
    groups: [],
    events: [{
      ...event,
      sharedSpaceId: credentials.id,
      sharedSpaceKey: credentials.key
    }],
    deletedParticipants: []
  };
  const latestRemote = structuredClone(remote);
  latestRemote.participants[0] = {
    ...latestRemote.participants[0],
    displayName: "Remote Owner Latest",
    profileUpdatedAt: "2026-08-26T07:59:30.000Z"
  };
  let writtenState = null;
  let readCount = 0;
  let updateCount = 0;

  await saveSharedEventState(
    {
      storage: {
        mode: "supabase",
        url: "https://project.supabase.co",
        table: "app_snapshots",
        anonKey: "anon",
        account: { userId: accountUserId, accessToken: "account-token" }
      }
    },
    local,
    event.id,
    async (url, options = {}) => {
      if (url.includes("/rpc/join_shared_event")) {
        return jsonResponse({ status: "active" });
      }
      if (url.includes("/rpc/update_shared_event_snapshot")) {
        updateCount += 1;
        if (updateCount === 1) return jsonResponse({ status: "conflict" });
        writtenState = JSON.parse(options.body).p_state;
        return jsonResponse({
          status: "updated",
          updatedAt: "2026-08-26T08:00:01.000Z"
        });
      }
      readCount += 1;
      return jsonResponse([
        {
          state: readCount === 1 ? remote : latestRemote,
          updated_at: readCount === 1
            ? "2026-08-26T07:59:00.000Z"
            : "2026-08-26T07:59:30.000Z"
        }
      ]);
    }
  );

  assert.deepEqual(
    writtenState.participants.find((participant) => participant.id === ownerId),
    latestRemote.participants[0]
  );
  assert.deepEqual(
    writtenState.participants.find((participant) => participant.id === actorId),
    local.participants[1]
  );
  assert.equal(updateCount, 2);
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

test("a lost local event credential reuses the accessible canonical snapshot", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000031";
  const participantId = `account-${accountUserId}`;
  const eventId = "event-recover-canonical-before-create";
  const canonicalSnapshotId = "event-space-canonical-existing";
  const event = {
    id: eventId,
    name: "Canonical event",
    participantIds: [participantId],
    inactiveParticipantIds: [],
    adminIds: [participantId],
    createdByParticipantId: participantId,
    expenses: [],
    transfers: []
  };
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Creator", accountLinked: true }],
    groups: [],
    events: [{
      ...event,
      sharedSpaceId: "event-space-stale-local",
      sharedSpaceKey: "event-share-key-stale-local-123456789012"
    }]
  };
  const canonicalState = {
    currentParticipantId: "",
    participants: state.participants,
    groups: [],
    events: [event]
  };
  const requests = [];

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
    eventId,
    async (url, options = {}) => {
      requests.push({ url, options });
      if (url.includes("/rpc/join_shared_event")) {
        return jsonResponse({ status: "active" });
      }
      if (url.includes("/rpc/update_shared_event_snapshot")) {
        assert.equal(JSON.parse(options.body).p_snapshot_id, canonicalSnapshotId);
        return jsonResponse({
          status: "updated",
          updatedAt: "2026-08-28T21:00:01.000Z"
        });
      }
      if (url.includes("snapshot_kind=eq.shared_event")) {
        return jsonResponse([{
          id: canonicalSnapshotId,
          state: canonicalState,
          updated_at: "2026-08-28T21:00:00.000Z"
        }]);
      }
      return jsonResponse([]);
    }
  );

  assert.equal(saved.events[0].sharedSpaceId, canonicalSnapshotId);
  assert.equal(saved.events[0].sharedSpaceKey, RECOVERED_MEMBER_SPACE_KEY);
  assert.equal(
    requests.some(({ url }) => url.includes("/rpc/create_shared_event_snapshot")),
    false
  );
});

test("a concurrent shared-event create recovers the snapshot won by another device", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000032";
  const participantId = `account-${accountUserId}`;
  const eventId = "event-create-race-canonical";
  const canonicalSnapshotId = "event-space-race-winner";
  const event = {
    id: eventId,
    name: "Race-safe event",
    participantIds: [participantId],
    inactiveParticipantIds: [],
    adminIds: [participantId],
    createdByParticipantId: participantId,
    expenses: [],
    transfers: []
  };
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Creator", accountLinked: true }],
    groups: [],
    events: [{
      ...event,
      sharedSpaceId: "event-space-race-loser",
      sharedSpaceKey: "event-share-key-race-loser-123456789012"
    }]
  };
  const canonicalState = {
    currentParticipantId: "",
    participants: state.participants,
    groups: [],
    events: [event]
  };
  let recoveryReadCount = 0;
  let createCount = 0;

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
    eventId,
    async (url) => {
      if (url.includes("/rpc/join_shared_event")) {
        return jsonResponse({ status: "active" });
      }
      if (url.includes("/rpc/update_shared_event_snapshot")) {
        return jsonResponse({
          status: "updated",
          updatedAt: "2026-08-28T21:30:01.000Z"
        });
      }
      if (url.includes("/rpc/create_shared_event_snapshot")) {
        createCount += 1;
        return jsonResponse({ code: "23505" }, 409);
      }
      if (url.includes("snapshot_kind=eq.shared_event")) {
        recoveryReadCount += 1;
        return recoveryReadCount === 1
          ? jsonResponse([])
          : jsonResponse([{
            id: canonicalSnapshotId,
            state: canonicalState,
            updated_at: "2026-08-28T21:30:00.000Z"
          }]);
      }
      return jsonResponse([]);
    }
  );

  assert.equal(createCount, 1);
  assert.equal(saved.events[0].sharedSpaceId, canonicalSnapshotId);
  assert.equal(saved.events[0].sharedSpaceKey, RECOVERED_MEMBER_SPACE_KEY);
});

test("shared event creation surfaces an expired account session", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000011";
  const participantId = `account-${accountUserId}`;
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Creator", accountLinked: true }],
    groups: [],
    events: [{
      id: "event-create-auth-expired",
      name: "Expired create",
      participantIds: [participantId],
      inactiveParticipantIds: [],
      adminIds: [participantId],
      createdByParticipantId: participantId,
      expenses: [],
      transfers: [],
      sharedSpaceId: "event-space-create-auth-expired",
      sharedSpaceKey: "event-share-key-create-auth-expired-123456"
    }]
  };

  await assert.rejects(
    saveSharedEventState(
      {
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          table: "app_snapshots",
          anonKey: "anon",
          account: { userId: accountUserId, accessToken: "expired-token" }
        }
      },
      state,
      "event-create-auth-expired",
      async (url) => url.includes("/rpc/create_shared_event_snapshot")
        ? { ok: false, status: 401 }
        : { ok: true, status: 200, async json() { return []; } }
    ),
    (error) =>
      error?.code === "CLOUD_STATE_AUTH_EXPIRED" && error?.status === 401
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

test("refresh surfaces an expired account session without revoking membership", async () => {
  const accountUserId = "00000000-0000-4000-8000-000000000011";
  const participantId = `account-${accountUserId}`;
  const state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: "Active member" }],
    groups: [],
    events: [{
      id: "event-auth-expired",
      name: "Still active event",
      participantIds: [participantId],
      inactiveParticipantIds: [],
      expenses: [],
      transfers: [],
      sharedSpaceId: "event-space-auth-expired",
      sharedSpaceKey: "event-share-key-auth-expired-1234567890"
    }]
  };
  await assert.rejects(
    refreshSharedEvents(
      {
        storage: {
          mode: "supabase",
          url: "https://project.supabase.co",
          table: "app_snapshots",
          anonKey: "anon",
          account: { userId: accountUserId, accessToken: "expired-account-token" }
        }
      },
      state,
      async (url) => url.includes("/rpc/join_shared_event")
        ? { ok: false, status: 401 }
        : { ok: true, status: 200, async json() { return []; } }
    ),
    (error) =>
      error?.code === "CLOUD_STATE_AUTH_EXPIRED" && error?.status === 401
  );

  const event = state.events[0];
  assert.deepEqual(event.inactiveParticipantIds, []);
  assert.equal(event.sharedSpaceId, "event-space-auth-expired");
  assert.equal(event.sharedSpaceKey, "event-share-key-auth-expired-1234567890");
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

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return value; }
  };
}
