import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { sendEventActivityNotification as sendClientEventActivityNotification } from "../src/data/eventActivityNotifications.mjs";
import { sendEventActivityNotification } from "../src/server/eventActivityNotifications.mjs";

const SENDER_USER_ID = "11111111-1111-4111-8111-111111111111";
const RECIPIENT_USER_ID = "22222222-2222-4222-8222-222222222222";
const SENDER_PARTICIPANT_ID = `account-${SENDER_USER_ID}`;
const RECIPIENT_PARTICIPANT_ID = `account-${RECIPIENT_USER_ID}`;
const EVENT_ID = "event-weekend";
const EXPENSE_ID = "expense-dinner";
const NOTIFICATION_ID = "33333333-3333-4333-8333-333333333333";

function runtimeConfig() {
  return {
    apiBaseUrl: "https://sogrim.example",
    publicUrl: "https://sogrim-hashbon.vercel.app/",
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      account: {
        userId: SENDER_USER_ID,
        accessToken: "account-access-token"
      }
    },
    launch: { cloudStorageReady: true, pushDeliveryReady: true }
  };
}

function eventState({
  currentParticipantId = SENDER_PARTICIPANT_ID,
  sharedSpaceId = "shared-event-space",
  expenseCreator = SENDER_PARTICIPANT_ID,
  inactiveParticipantIds = []
} = {}) {
  return {
    currentParticipantId,
    participants: [
      {
        id: SENDER_PARTICIPANT_ID,
        displayName: "ירין כהן",
        accountLinked: true
      },
      {
        id: RECIPIENT_PARTICIPANT_ID,
        displayName: "דני לוי",
        accountLinked: true
      }
    ],
    events: [
      {
        id: EVENT_ID,
        name: "סוף שבוע בצפון",
        sharedSpaceId,
        sharedSpaceKey: "shared-event-secret-that-is-long-enough-123",
        participantIds: [
          SENDER_PARTICIPANT_ID,
          RECIPIENT_PARTICIPANT_ID
        ],
        inactiveParticipantIds,
        expenses: [
          {
            id: EXPENSE_ID,
            name: "ארוחת ערב",
            total: 25000,
            createdByParticipantId: expenseCreator,
            payers: [
              {
                participantId: SENDER_PARTICIPANT_ID,
                amount: 25000
              }
            ],
            sharedByParticipantIds: [
              SENDER_PARTICIPANT_ID,
              RECIPIENT_PARTICIPANT_ID
            ]
          }
        ]
      }
    ]
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createActivityFetch({
  senderState = eventState(),
  recipientState = eventState({
    currentParticipantId: RECIPIENT_PARTICIPANT_ID
  }),
  preferences = { eventUpdates: true },
  devices = ["device-token-that-is-long-enough"],
  acceptedFriend = true,
  reservation = {
    allowed: true,
    notification_id: NOTIFICATION_ID
  }
} = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    requests.push({ url: address, options });

    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: SENDER_USER_ID });
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      if (!address.includes("owner_user_id")) {
        return jsonResponse([
          {
            state: senderState,
            access_key_hash: createHash("sha256")
              .update(senderState.events[0].sharedSpaceKey)
              .digest("hex")
          }
        ]);
      }
      const isRecipient = address.includes(
        encodeURIComponent(`eq.${RECIPIENT_USER_ID}`)
      );
      return jsonResponse([
        { state: isRecipient ? recipientState : senderState }
      ]);
    }
    if (address.includes("/rest/v1/push_devices?")) {
      return jsonResponse(
        devices.map((token) => ({ token, preferences }))
      );
    }
    if (address.includes("/rest/v1/friendships?")) {
      return jsonResponse(acceptedFriend ? [{ id: "friendship-1" }] : []);
    }
    if (
      address.includes("/rest/v1/event_invite_tokens?") &&
      !options.method
    ) {
      return jsonResponse([]);
    }
    if (address.endsWith("/rest/v1/rpc/rotate_private_event_invite")) {
      return jsonResponse("44444444-4444-4444-8444-444444444444");
    }
    if (
      address.includes("/rest/v1/event_invite_tokens") &&
      ["PATCH", "POST"].includes(options.method)
    ) {
      return new Response(null, {
        status: options.method === "POST" ? 201 : 204
      });
    }
    if (
      address.endsWith(
        "/rest/v1/rpc/reserve_event_activity_notification"
      )
    ) {
      return jsonResponse(reservation);
    }
    if (
      address.includes("/rest/v1/notification_inbox?") &&
      options.method === "POST"
    ) {
      return new Response(null, { status: 201 });
    }
    if (address.includes("fcm.googleapis.com/")) {
      return jsonResponse({ name: "projects/demo/messages/1" });
    }
    if (
      address.includes("/rest/v1/event_activity_notifications?") &&
      ["PATCH", "DELETE"].includes(options.method)
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };

  return { fetchImpl, requests };
}

test("server sends a private event update only to a verified connected participant", async () => {
  const { fetchImpl, requests } = createActivityFetch();
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    ok: true,
    delivered: 1,
    recipients: 1,
    inboxRecipients: 1
  });

  const reservation = requests.find((request) =>
    request.url.endsWith(
      "/rest/v1/rpc/reserve_event_activity_notification"
    )
  );
  assert.deepEqual(JSON.parse(reservation.options.body), {
    p_event_id: EVENT_ID,
    p_activity_id: EXPENSE_ID,
    p_kind: "expense-created",
    p_sender_user_id: SENDER_USER_ID,
    p_recipient_user_id: RECIPIENT_USER_ID,
    p_min_interval_seconds: 45
  });

  const delivery = requests.find((request) =>
    request.url.includes("fcm.googleapis.com/")
  );
  const message = JSON.parse(delivery.options.body).message;
  assert.equal(message.data.eventId, EVENT_ID);
  assert.equal(message.data.activityId, EXPENSE_ID);
  assert.equal(message.data.view, "event");
  assert.doesNotMatch(message.notification.body, /250|ארוחת ערב/);
  assert.match(message.notification.body, /סוף שבוע בצפון/);

  const inboxWrite = requests.find((request) =>
    request.url.includes("/rest/v1/notification_inbox?")
  );
  const inboxItem = JSON.parse(inboxWrite.options.body);
  assert.equal(inboxItem.recipient_user_id, RECIPIENT_USER_ID);
  assert.equal(inboxItem.event_id, EVENT_ID);
  assert.equal(inboxItem.activity_id, EXPENSE_ID);
  assert.equal(inboxItem.view, "event");
  assert.doesNotMatch(inboxItem.body, /250|ארוחת ערב/);
});

test("server keeps the in-app inbox working when system push is not configured", async () => {
  const { fetchImpl, requests } = createActivityFetch();
  const config = runtimeConfig();
  config.launch.pushDeliveryReady = false;

  const result = await sendEventActivityNotification({
    runtimeConfig: config,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl,
    accessTokenProvider: async () => {
      throw new Error("Firebase must not be requested for in-app-only delivery");
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.reason, "in-app-only");
  assert.equal(result.payload.inboxRecipients, 1);
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/notification_inbox?")
    ),
    true
  );
  assert.equal(
    requests.some((request) => request.url.includes("push_devices")),
    false
  );
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("two connected accounts keep one inbox item while the recipient receives it on two devices", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    devices: [
      "first-device-token-that-is-long-enough",
      "second-device-token-that-is-long-enough"
    ]
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.delivered, 2);
  assert.equal(result.payload.recipients, 1);
  assert.equal(result.payload.inboxRecipients, 1);
  assert.equal(
    requests.filter((request) =>
      request.url.includes("/rest/v1/notification_inbox?")
    ).length,
    1
  );
  assert.equal(
    requests.filter((request) =>
      request.url.includes("fcm.googleapis.com/")
    ).length,
    2
  );
});

test("server rejects an expense update that was not created by the caller", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    senderState: eventState({ expenseCreator: RECIPIENT_PARTICIPANT_ID })
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "EVENT_ACTIVITY_NOT_ALLOWED");
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server repairs an account whose event copy has stale share credentials", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    recipientState: eventState({
      currentParticipantId: RECIPIENT_PARTICIPANT_ID,
      sharedSpaceId: "different-space"
    })
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.delivered, 1);
  const inboxWrite = requests.find((request) =>
    request.url.includes("/rest/v1/notification_inbox?")
  );
  assert.match(
    JSON.parse(inboxWrite.options.body).action_url,
    /\/i\/event-weekend\/t\//
  );
});

test("server respects the recipient event update preference", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    preferences: { eventUpdates: false }
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: SENDER_PARTICIPANT_ID,
    kind: "participant-joined",
    fetchImpl
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.reason, "in-app-only");
  assert.equal(result.payload.inboxRecipients, 1);
  assert.equal(
    requests.some((request) =>
      request.url.includes("reserve_event_activity_notification")
    ),
    true
  );
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server sends an active online participant a secure event invitation", async () => {
  const { fetchImpl, requests } = createActivityFetch();
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: RECIPIENT_PARTICIPANT_ID,
    kind: "event-invite",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.delivered, 1);
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/friendships?")
    ),
    false
  );
  const inboxWrite = requests.find((request) =>
    request.url.includes("/rest/v1/notification_inbox?")
  );
  const inboxItem = JSON.parse(inboxWrite.options.body);
  assert.equal(inboxItem.kind, "event-invite");
  assert.equal(inboxItem.activity_id, RECIPIENT_PARTICIPANT_ID);
  assert.match(
    inboxItem.action_url,
    /^https:\/\/sogrim-hashbon\.vercel\.app\/i\/event-weekend\/t\/[A-Za-z0-9_-]{32,128}$/
  );
  assert.doesNotMatch(inboxItem.action_url, /shared-event-space|shared-event-secret/);

  const delivery = requests.find((request) =>
    request.url.includes("fcm.googleapis.com/")
  );
  const message = JSON.parse(delivery.options.body).message;
  assert.equal(message.data.kind, "event-invite");
  assert.equal(message.data.actionUrl, inboxItem.action_url);
  assert.match(message.notification.title, /הזמנה/);
});

test("a pending friendship cannot strand an active event participant", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    acceptedFriend: false
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: RECIPIENT_PARTICIPANT_ID,
    kind: "event-invite",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.delivered, 1);
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/notification_inbox?")
    ),
    true
  );
  assert.equal(
    requests.some((request) => request.url.includes("/rest/v1/friendships?")),
    false
  );
});

test("an expense notification repairs access when the recipient workspace lost the event", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    recipientState: {
      currentParticipantId: RECIPIENT_PARTICIPANT_ID,
      participants: [],
      events: []
    }
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.delivered, 1);
  const inboxWrite = requests.find((request) =>
    request.url.includes("/rest/v1/notification_inbox?")
  );
  const inboxItem = JSON.parse(inboxWrite.options.body);
  assert.equal(inboxItem.kind, "expense-created");
  assert.match(
    inboxItem.action_url,
    /^https:\/\/sogrim-hashbon\.vercel\.app\/i\/event-weekend\/t\/[A-Za-z0-9_-]{32,128}$/
  );
  const delivery = requests.find((request) =>
    request.url.includes("fcm.googleapis.com/")
  );
  assert.equal(
    JSON.parse(delivery.options.body).message.data.actionUrl,
    inboxItem.action_url
  );
});

test("server refuses to invite a friend who was removed from the event", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    senderState: eventState({
      inactiveParticipantIds: [RECIPIENT_PARTICIPANT_ID]
    })
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: RECIPIENT_PARTICIPANT_ID,
    kind: "event-invite",
    fetchImpl
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "EVENT_ACTIVITY_NOT_ALLOWED");
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/notification_inbox?")
    ),
    false
  );
});

test("a removed account cannot announce that it joined through an old link", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    senderState: eventState({
      inactiveParticipantIds: [SENDER_PARTICIPANT_ID]
    })
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: SENDER_PARTICIPANT_ID,
    kind: "participant-joined",
    fetchImpl
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "EVENT_ACTIVITY_NOT_ALLOWED");
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/notification_inbox?")
    ),
    false
  );
});

test("rapid expenses stay in the inbox even when a second push is rate limited", async () => {
  const { fetchImpl, requests } = createActivityFetch({
    reservation: { allowed: false, reason: "rate-limited" }
  });
  const result = await sendEventActivityNotification({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    activityId: EXPENSE_ID,
    kind: "expense-created",
    fetchImpl
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.reason, "in-app-only");
  assert.equal(result.payload.inboxRecipients, 1);
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("client sends an authenticated keepalive request after a durable save", async () => {
  const calls = [];
  const result = await sendClientEventActivityNotification(
    runtimeConfig(),
    {
      eventId: EVENT_ID,
      activityId: EXPENSE_ID,
      kind: "expense-created"
    },
    async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true, delivered: 1 });
    }
  );

  assert.equal(result.delivered, 1);
  assert.equal(
    calls[0].url,
    "https://sogrim.example/api/notifications/event-activity"
  );
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer account-access-token"
  );
  assert.equal(calls[0].options.keepalive, true);
});

test("client requests in-app delivery even when system push is unavailable", async () => {
  const calls = [];
  const config = runtimeConfig();
  config.launch.pushDeliveryReady = false;
  config.launch.cloudStorageReady = true;

  const result = await sendClientEventActivityNotification(
    config,
    {
      eventId: EVENT_ID,
      activityId: EXPENSE_ID,
      kind: "expense-created"
    },
    async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        ok: true,
        delivered: 0,
        inboxRecipients: 1,
        reason: "in-app-only"
      });
    }
  );

  assert.equal(result.inboxRecipients, 1);
  assert.equal(calls.length, 1);
});

test("client accepts the event invitation activity kind", async () => {
  const calls = [];
  const result = await sendClientEventActivityNotification(
    runtimeConfig(),
    {
      eventId: EVENT_ID,
      activityId: RECIPIENT_PARTICIPANT_ID,
      kind: "event-invite"
    },
    async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true, inboxRecipients: 1 });
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    eventId: EVENT_ID,
    activityId: RECIPIENT_PARTICIPANT_ID,
    kind: "event-invite"
  });
});
