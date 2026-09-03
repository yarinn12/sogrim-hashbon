import test from "node:test";
import assert from "node:assert/strict";
import { sendPaymentReminder as sendClientPaymentReminder } from "../src/data/paymentReminders.mjs";
import { sendPaymentReminder } from "../src/server/paymentReminders.mjs";

const CREDITOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const DEBTOR_USER_ID = "22222222-2222-4222-8222-222222222222";
const CREDITOR_PARTICIPANT_ID = `account-${CREDITOR_USER_ID}`;
const DEBTOR_PARTICIPANT_ID = `account-${DEBTOR_USER_ID}`;
const EVENT_ID = "event-payment-reminder";
const TRANSFER_ID =
  `transfer-${DEBTOR_PARTICIPANT_ID}-${CREDITOR_PARTICIPANT_ID}-5000`;
const REMINDER_ID = "33333333-3333-4333-8333-333333333333";
const SHARED_SPACE_ID = "shared-reminder-space";
const SHARED_SPACE_KEY = "shared-reminder-key-abcdefghijklmnopqrstuvwxyz";

function runtimeConfig() {
  return {
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key"
    },
    launch: { pushDeliveryReady: true }
  };
}

function accountState({
  includeEvent = true,
  transferStatus = "pending",
  sharedSpaceKey = SHARED_SPACE_KEY
} = {}) {
  return {
    currentParticipantId: CREDITOR_PARTICIPANT_ID,
    participants: [
      {
        id: CREDITOR_PARTICIPANT_ID,
        displayName: "ירין כהן",
        accountLinked: true
      },
      {
        id: DEBTOR_PARTICIPANT_ID,
        displayName: "דני לוי",
        accountLinked: true
      }
    ],
    events: includeEvent
      ? [
          {
            id: EVENT_ID,
            name: "ארוחת שישי",
            currency: "ILS",
            sharedSpaceId: SHARED_SPACE_ID,
            sharedSpaceKey,
            participantIds: [
              CREDITOR_PARTICIPANT_ID,
              DEBTOR_PARTICIPANT_ID
            ],
            expenses: [
              {
                id: "expense-dinner",
                name: "ארוחה",
                total: 10000,
                payers: [
                  {
                    participantId: CREDITOR_PARTICIPANT_ID,
                    amount: 10000
                  }
                ],
                sharedByParticipantIds: [
                  CREDITOR_PARTICIPANT_ID,
                  DEBTOR_PARTICIPANT_ID
                ]
              }
            ],
            transfers: [
              {
                id: TRANSFER_ID,
                fromParticipantId: DEBTOR_PARTICIPANT_ID,
                toParticipantId: CREDITOR_PARTICIPANT_ID,
                amount: 5000,
                status: transferStatus
              }
            ]
          }
        ]
      : []
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createReminderFetch({
  actorId = CREDITOR_USER_ID,
  senderState = accountState(),
  recipientState = accountState(),
  authoritativeState = accountState(),
  canonicalMembership = true,
  reservation = { allowed: true, reminder_id: REMINDER_ID },
  reservationStatus = 200,
  pushResponseStatus = 200,
  pushHandler = null,
  inboxHandler = null,
  inboxStatus = 201
} = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    requests.push({ url: address, options });

    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: actorId });
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      if (address.includes("snapshot_kind=eq.shared_event")) {
        return jsonResponse([{
          state: authoritativeState
        }]);
      }
      const isRecipient = address.includes(
        encodeURIComponent(`eq.${DEBTOR_USER_ID}`)
      );
      return jsonResponse([
        { state: isRecipient ? recipientState : senderState }
      ]);
    }
    if (address.includes("/rest/v1/push_devices?")) {
      return jsonResponse([
        {
          token: "device-token-that-is-long-enough",
          preferences: { paymentReminders: true }
        }
      ]);
    }
    if (address.endsWith("/rest/v1/rpc/reserve_payment_reminder")) {
      return jsonResponse(reservation, reservationStatus);
    }
    if (address.endsWith("/rest/v1/rpc/verify_shared_event_notification_parties")) {
      return jsonResponse(canonicalMembership);
    }
    if (
      address.includes("/rest/v1/notification_inbox?") &&
      options.method === "POST"
    ) {
      if (inboxHandler) return inboxHandler({ url: address, options });
      return new Response(null, { status: inboxStatus });
    }
    if (address.includes("fcm.googleapis.com/")) {
      if (pushHandler) return pushHandler({ url: address, options });
      return pushResponseStatus >= 200 && pushResponseStatus < 300
        ? jsonResponse({ name: "projects/demo/messages/1" }, pushResponseStatus)
        : jsonResponse({ error: { status: "UNAVAILABLE" } }, pushResponseStatus);
    }
    if (
      address.includes("/rest/v1/payment_reminders?") &&
      options.method === "PATCH"
    ) {
      return new Response(null, { status: 204 });
    }
    if (
      address.includes("/rest/v1/payment_reminders?") &&
      options.method === "DELETE"
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${address}`);
  };

  return { fetchImpl, requests };
}

test("server sends a reminder only after the authoritative shared event approves it", async () => {
  const { fetchImpl, requests } = createReminderFetch();
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
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
    inbox: true,
    recipientParticipantId: DEBTOR_PARTICIPANT_ID
  });

  const reservation = requests.find((request) =>
    request.url.endsWith("/rest/v1/rpc/reserve_payment_reminder")
  );
  assert.deepEqual(JSON.parse(reservation.options.body), {
    p_event_id: EVENT_ID,
    p_transfer_id: TRANSFER_ID,
    p_sender_user_id: CREDITOR_USER_ID,
    p_recipient_user_id: DEBTOR_USER_ID,
    p_cooldown_minutes: 720
  });

  const delivery = requests.find((request) =>
    request.url.includes("fcm.googleapis.com/")
  );
  const message = JSON.parse(delivery.options.body).message;
  assert.equal(message.data.eventId, EVENT_ID);
  assert.equal(message.data.transferId, TRANSFER_ID);
  assert.equal(message.data.view, "summary");
  assert.doesNotMatch(message.notification.body, /50\.00|סוף שבוע בצפון/);
  assert.match(message.notification.body, /באפליקציה/);
  assert.equal(delivery.options.headers.authorization, "Bearer firebase-access-token");

  const inboxWrite = requests.find((request) =>
    request.url.includes("/rest/v1/notification_inbox?")
  );
  const inboxItem = JSON.parse(inboxWrite.options.body);
  assert.equal(inboxItem.recipient_user_id, DEBTOR_USER_ID);
  assert.equal(inboxItem.event_id, EVENT_ID);
  assert.equal(inboxItem.activity_id, TRANSFER_ID);
  assert.equal(inboxItem.kind, "payment-reminder");
  assert.equal(inboxItem.view, "summary");
  assert.match(inboxItem.body, /50\.00/);
});

test("server rejects reminders when the caller is not the creditor", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    actorId: DEBTOR_USER_ID
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer debtor-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "REMINDER_NOT_ALLOWED");
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server fails closed when the authoritative shared transfer is already paid", async () => {
  const { fetchImpl } = createReminderFetch({
    authoritativeState: accountState({ transferStatus: "paid" })
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "REMINDER_NOT_ALLOWED");
});

test("server reminder deadline includes the authenticated-user response body", async () => {
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      sendPaymentReminder({
        runtimeConfig: runtimeConfig(),
        env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
        authorization: "Bearer account-access-token",
        eventId: EVENT_ID,
        transferId: TRANSFER_ID,
        requestTimeoutMs: 20,
        fetchImpl: async (_url, options) => {
          requestSignal = options.signal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          };
        }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("server reminder body stayed unbounded")), 300)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(requestSignal?.aborted, true);
});

test("a pre-FCM reminder deadline releases its reservation after a stalled inbox write", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    inboxHandler: () => new Promise(() => {})
  });

  await assert.rejects(
    Promise.race([
      sendPaymentReminder({
        runtimeConfig: runtimeConfig(),
        env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
        authorization: "Bearer account-access-token",
        eventId: EVENT_ID,
        transferId: TRANSFER_ID,
        fetchImpl,
        requestTimeoutMs: 25
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("reminder cleanup stayed unbounded")), 500)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/payment_reminders?") &&
      request.options.method === "DELETE"
    ),
    true,
    "an unattempted reminder must remain retryable"
  );
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("a stalled reminder push falls back to the inbox within its deadline", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    pushHandler: () => new Promise(() => {})
  });
  const startedAt = Date.now();
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    deliveryTimeoutMs: 15,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.reason, "in-app-only");
  assert.ok(Date.now() - startedAt < 500, "a stalled provider must stay bounded");
  assert.ok(requests.some((request) =>
    request.url.includes("/rest/v1/payment_reminders?") &&
    request.options.method === "PATCH"
  ));
});

test("an unconfirmed reminder is not retried when its inbox write also failed", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    pushHandler: () => new Promise(() => {}),
    inboxStatus: 503
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    deliveryTimeoutMs: 15,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 502);
  assert.equal(result.payload.code, "DELIVERY_UNCONFIRMED");
  assert.equal(result.payload.retryable, false);
  assert.ok(requests.some((request) =>
    request.url.includes("/rest/v1/payment_reminders?") &&
    request.options.method === "PATCH"
  ));
  assert.equal(requests.some((request) =>
    request.url.includes("/rest/v1/payment_reminders?") &&
    request.options.method === "DELETE"
  ), false);
});

test("server authorizes a canonical member when a rotated link left a stale workspace key", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    senderState: accountState({ sharedSpaceKey: "stale-rotated-link-key" })
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.recipientParticipantId, DEBTOR_PARTICIPANT_ID);
  assert.equal(
    requests.filter((request) =>
      request.url.endsWith("/rest/v1/rpc/verify_shared_event_notification_parties")
    ).length,
    2
  );
});

test("server rejects a reminder when canonical shared membership is missing", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    canonicalMembership: false
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, "REMINDER_NOT_ALLOWED");
  assert.equal(
    requests.some((request) =>
      request.url.endsWith("/rest/v1/rpc/reserve_payment_reminder")
    ),
    false
  );
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server enforces the reminder cooldown before contacting Firebase", async () => {
  const retryAt = "2099-01-01T00:00:00.000Z";
  const { fetchImpl, requests } = createReminderFetch({
    reservation: { allowed: false, retry_at: retryAt }
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 429);
  assert.equal(result.payload.code, "REMINDER_COOLDOWN");
  assert.equal(result.payload.retryAt, retryAt);
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server reports reminder storage outages instead of a false cooldown", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    reservation: { error: "temporary database failure" },
    reservationStatus: 503
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 503);
  assert.equal(result.payload.code, "REMINDER_STORAGE_UNAVAILABLE");
  assert.equal(result.payload.retryable, true);
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server keeps the in-app reminder available when system push is unavailable", async () => {
  const { fetchImpl, requests } = createReminderFetch();
  const config = runtimeConfig();
  config.launch.pushDeliveryReady = false;
  const result = await sendPaymentReminder({
    runtimeConfig: config,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    ok: true,
    delivered: 0,
    inbox: true,
    reason: "in-app-only"
  });
  assert.equal(
    requests.some((request) => request.url.includes("/rest/v1/notification_inbox?")),
    true
  );
  assert.equal(
    requests.some((request) => request.url.includes("/rest/v1/push_devices?")),
    false
  );
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
});

test("server reports success when inbox delivery works but every push attempt fails", async () => {
  const { fetchImpl, requests } = createReminderFetch({
    pushResponseStatus: 503
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "sogrim-demo"
    })
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    ok: true,
    delivered: 0,
    inbox: true,
    reason: "in-app-only"
  });
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/payment_reminders?") &&
      request.options.method === "PATCH"
    ),
    true
  );
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/payment_reminders?") &&
      request.options.method === "DELETE"
    ),
    false
  );
});

test("server falls back to the inbox when Firebase credentials are temporarily unavailable", async () => {
  const { fetchImpl } = createReminderFetch();
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    accessTokenProvider: async () => {
      throw new Error("temporary Firebase outage");
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.reason, "in-app-only");
});

test("server falls back to the inbox when Firebase authorization stalls", async () => {
  const { fetchImpl } = createReminderFetch();
  const startedAt = Date.now();
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    accessTokenTimeoutMs: 20,
    accessTokenProvider: async () => new Promise(() => {})
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.reason, "in-app-only");
  assert.ok(Date.now() - startedAt < 1_000);
});

test("an expired Firebase authorization releases a reminder when inbox delivery failed", async () => {
  const { fetchImpl, requests } = createReminderFetch({ inboxStatus: 503 });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    requestTimeoutMs: 200,
    accessTokenTimeoutMs: 250,
    accessTokenProvider: async () => new Promise(() => {})
  });

  assert.equal(result.status, 503);
  assert.equal(result.payload.code, "PUSH_UNAVAILABLE");
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/payment_reminders?") &&
      request.options.method === "DELETE"
    ),
    true,
    "a failed inbox plus unattempted push must not poison the reminder cooldown"
  );
});

test("a late Firebase authorization result does not masquerade as an attempted reminder", async () => {
  const { fetchImpl, requests } = createReminderFetch({ inboxStatus: 503 });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl,
    requestTimeoutMs: 200,
    accessTokenTimeoutMs: 500,
    accessTokenProvider: async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        accessToken: "firebase-access-token",
        projectId: "sogrim-demo"
      };
    }
  });

  assert.equal(result.status, 503);
  assert.equal(result.payload.code, "PUSH_UNAVAILABLE");
  assert.equal(
    requests.some((request) => request.url.includes("fcm.googleapis.com/")),
    false
  );
  assert.equal(
    requests.some((request) =>
      request.url.includes("/rest/v1/payment_reminders?") &&
      request.options.method === "DELETE"
    ),
    true
  );
});

test("client reminder store requests in-app delivery without a device push capability", async () => {
  const calls = [];
  const result = await sendClientPaymentReminder(
    {
      apiBaseUrl: "https://sogrim.example",
      launch: { pushDeliveryReady: false },
      storage: {
        account: {
          userId: CREDITOR_USER_ID,
          accessToken: "account-access-token"
        }
      }
    },
    { eventId: EVENT_ID, transferId: TRANSFER_ID },
    async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ ok: true, delivered: 1 });
    }
  );

  assert.equal(result.delivered, 1);
  assert.equal(
    calls[0].url,
    "https://sogrim.example/api/notifications/payment-reminder"
  );
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer account-access-token"
  );
});

test("client reminder store releases a hanging mobile request after its timeout", async () => {
  let requestSignal = null;

  await assert.rejects(
    sendClientPaymentReminder(
      {
        apiBaseUrl: "https://sogrim.example",
        storage: {
          account: {
            userId: CREDITOR_USER_ID,
            accessToken: "account-access-token"
          }
        }
      },
      { eventId: EVENT_ID, transferId: TRANSFER_ID },
      async (_url, options) => {
        requestSignal = options.signal;
        return new Promise(() => {});
      },
      5
    ),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );

  assert.equal(requestSignal?.aborted, true);
});

test("client reminder store keeps response JSON inside its timeout", async () => {
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      sendClientPaymentReminder(
        {
          apiBaseUrl: "https://sogrim.example",
          storage: {
            account: {
              userId: CREDITOR_USER_ID,
              accessToken: "account-access-token"
            }
          }
        },
        { eventId: EVENT_ID, transferId: TRANSFER_ID },
        async (_url, options) => {
          requestSignal = options.signal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          };
        },
        5
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("reminder response body stayed unbounded")), 250)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );

  assert.equal(requestSignal?.aborted, true);
});
