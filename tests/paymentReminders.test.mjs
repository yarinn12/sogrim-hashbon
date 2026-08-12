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

function accountState({ includeEvent = true } = {}) {
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
                status: "pending"
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
  recipientState = accountState(),
  reservation = { allowed: true, reminder_id: REMINDER_ID }
} = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    requests.push({ url: address, options });

    if (address.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: actorId });
    }
    if (address.includes("/rest/v1/app_snapshots?")) {
      const isRecipient = address.includes(
        encodeURIComponent(`eq.${DEBTOR_USER_ID}`)
      );
      return jsonResponse([
        { state: isRecipient ? recipientState : accountState() }
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

test("server sends an authenticated FCM reminder only after both account states agree", async () => {
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
  assert.match(message.notification.body, /50\.00/);
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

test("server fails closed when the debtor copy is not synchronized", async () => {
  const { fetchImpl } = createReminderFetch({
    recipientState: accountState({ includeEvent: false })
  });
  const result = await sendPaymentReminder({
    runtimeConfig: runtimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer account-access-token",
    eventId: EVENT_ID,
    transferId: TRANSFER_ID,
    fetchImpl
  });

  assert.equal(result.status, 409);
  assert.equal(result.payload.code, "EVENT_NOT_SYNCED");
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

test("client reminder store sends only account-authenticated requests", async () => {
  const calls = [];
  const result = await sendClientPaymentReminder(
    {
      apiBaseUrl: "https://sogrim.example",
      launch: { pushDeliveryReady: true },
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
