import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createAppHandler } from "../server.mjs";
import {
  broadcastAuthorizationToken,
  sendBroadcastNotification
} from "../src/server/broadcastNotifications.mjs";

const env = {
  SUPABASE_URL: "https://supabase.example",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUSH_DELIVERY_ENABLED: "true"
};

test("broadcast notifications reject unauthenticated requests", async () => {
  let fetchCalls = 0;
  const result = await sendBroadcastNotification({
    env,
    authorization: "Bearer wrong",
    title: "Test",
    body: "Test body",
    campaignId: "test-campaign",
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("[]", { status: 200 });
    }
  });

  assert.equal(result.status, 401);
  assert.equal(result.payload.code, "UNAUTHORIZED");
  assert.equal(fetchCalls, 0);
});

test("an unreadable push-device list is not reported as a zero-recipient success", async () => {
  const result = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "unreadable-recipients",
    fetchImpl: async (url) => {
      assert.match(String(url), /\/rest\/v1\/push_devices\?/);
      return new Response("{truncated", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    },
    accessTokenProvider: async () => {
      throw new Error("recipient failure must stop before Firebase authorization");
    }
  });

  assert.equal(result.status, 503);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.code, "RECIPIENTS_UNAVAILABLE");
});

test("broadcast deadline includes the push-recipient response body", async () => {
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      sendBroadcastNotification({
        env,
        authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
        title: "Test",
        body: "Test body",
        campaignId: "stalled-recipient-body",
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
        setTimeout(() => reject(new Error("broadcast recipient body stayed unbounded")), 300)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(requestSignal?.aborted, true);
});

test("broadcast notifications stop waiting when Firebase authorization stalls", async () => {
  let firebaseCalls = 0;
  const startedAt = Date.now();
  const result = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "stalled-authorization",
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.startsWith("https://supabase.example/rest/v1/push_devices?")) {
        return Response.json([
          { id: "device-1", user_id: "user-1", token: "token-1", platform: "ios" }
        ]);
      }
      throw new Error(`Unexpected request: ${target}`);
    },
    accessTokenProvider: async () => {
      firebaseCalls += 1;
      return new Promise(() => {});
    },
    accessTokenTimeoutMs: 15
  });

  assert.equal(result.status, 503);
  assert.equal(result.payload.code, "PUSH_UNAVAILABLE");
  assert.equal(firebaseCalls, 1);
  assert.ok(Date.now() - startedAt < 500, "Firebase authorization must stay bounded");
});

test("broadcast notifications deliver once per enabled device token", async () => {
  const firebaseMessages = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/broadcast_notification_deliveries")) {
      if (options.method === "PATCH") return new Response(null, { status: 204 });
      return Response.json(JSON.parse(options.body));
    }
    if (target.startsWith("https://supabase.example/rest/v1/push_devices?")) {
      return Response.json([
        { id: "1", user_id: "user-1", token: "token-1", platform: "android" },
        { id: "2", user_id: "user-1", token: "token-1", platform: "android" },
        { id: "3", user_id: "user-2", token: "token-2", platform: "android" }
      ]);
    }
    if (target.includes("fcm.googleapis.com")) {
      firebaseMessages.push(JSON.parse(options.body));
      return Response.json({ name: "message-id" });
    }
    throw new Error(`Unexpected request: ${target}`);
  };

  const result = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "זה הזמן לסגור חשבון 👀",
    body: "פותחים ומסיימים ✨",
    campaignId: "close-account-test",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "firebase-project"
    })
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    ok: true,
    targetedDevices: 2,
    targetedUsers: 2,
    delivered: 2,
    failed: 0,
    disabledInvalid: 0,
    suppressedDuplicates: 0
  });
  assert.equal(firebaseMessages.length, 2);
  assert.equal(
    firebaseMessages[0].message.notification.title,
    "זה הזמן לסגור חשבון 👀"
  );
  assert.equal(
    firebaseMessages[0].message.data.campaign,
    "close-account-test"
  );
  assert.equal(
    firebaseMessages[0].message.android.collapse_key,
    "close-account-test"
  );
  assert.equal(
    firebaseMessages[0].message.apns.headers["apns-collapse-id"],
    "close-account-test"
  );
});

test("broadcast notifications suppress a campaign already reserved for the device", async () => {
  let firebaseCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith("https://supabase.example/rest/v1/push_devices?")) {
      return Response.json([
        { id: "device-1", user_id: "user-1", token: "token-1", platform: "ios" }
      ]);
    }
    if (target.includes("/rest/v1/broadcast_notification_deliveries")) {
      if (options.method === "POST") return Response.json([]);
      return Response.json([{ delivered_at: "2026-09-02T12:00:00.000Z" }]);
    }
    if (target.includes("fcm.googleapis.com")) {
      firebaseCalls += 1;
      return Response.json({ name: "message-id" });
    }
    throw new Error(`Unexpected request: ${target}`);
  };

  const result = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "already-sent",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "firebase-project"
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.delivered, 0);
  assert.equal(result.payload.suppressedDuplicates, 1);
  assert.equal(firebaseCalls, 0);
});

test("broadcast notifications fail closed when durable anti-spam storage is unavailable", async () => {
  let firebaseCalls = 0;
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.startsWith("https://supabase.example/rest/v1/push_devices?")) {
      return Response.json([
        { id: "device-1", user_id: "user-1", token: "token-1", platform: "android" }
      ]);
    }
    if (target.includes("/rest/v1/broadcast_notification_deliveries")) {
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
    if (target.includes("fcm.googleapis.com")) {
      firebaseCalls += 1;
      return Response.json({ name: "unexpected" });
    }
    throw new Error(`Unexpected request: ${target}`);
  };

  const result = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "storage-unavailable",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "firebase-project"
    })
  });

  assert.equal(result.status, 502);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.failed, 1);
  assert.equal(firebaseCalls, 0);
});

test("a transient FCM failure releases its reservation and a retry delivers once", async () => {
  const reservations = new Map();
  let fcmAvailable = false;
  let firebaseCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith("https://supabase.example/rest/v1/push_devices?")) {
      return Response.json([
        { id: "device-1", user_id: "user-1", token: "token-1", platform: "ios" },
        { id: "device-2", user_id: "user-2", token: "token-2", platform: "android" }
      ]);
    }
    if (target.includes("/rest/v1/broadcast_notification_deliveries")) {
      const params = new URL(target).searchParams;
      const key = `${params.get("campaign_id")?.replace(/^eq\./, "") ?? ""}:` +
        `${params.get("device_id")?.replace(/^eq\./, "") ?? ""}`;
      if (options.method === "POST") {
        const [row] = JSON.parse(options.body);
        const rowKey = `${row.campaign_id}:${row.device_id}`;
        if (reservations.has(rowKey)) return Response.json([]);
        reservations.set(rowKey, { delivered: false });
        return Response.json([row]);
      }
      if (options.method === "PATCH") {
        reservations.set(key, { delivered: true });
        return new Response(null, { status: 204 });
      }
      if (options.method === "DELETE") {
        if (reservations.get(key)?.delivered === false) reservations.delete(key);
        return new Response(null, { status: 204 });
      }
      const reservation = reservations.get(key);
      return Response.json(reservation
        ? [{ delivered_at: reservation.delivered ? "2026-09-02T12:00:00.000Z" : null }]
        : []);
    }
    if (target.includes("fcm.googleapis.com")) {
      firebaseCalls += 1;
      return fcmAvailable
        ? Response.json({ name: `message-${firebaseCalls}` })
        : Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 });
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${target}`);
  };
  const args = {
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "retryable-campaign",
    fetchImpl,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "firebase-project"
    })
  };

  const first = await sendBroadcastNotification(args);
  assert.equal(first.status, 502);
  assert.equal(first.payload.failed, 2);
  assert.equal(reservations.size, 0, "failed sends must not poison a retry");

  fcmAvailable = true;
  const retry = await sendBroadcastNotification(args);
  assert.equal(retry.status, 200);
  assert.equal(retry.payload.delivered, 2);
  assert.equal(retry.payload.suppressedDuplicates, 0);

  const deliveredCalls = firebaseCalls;
  const duplicate = await sendBroadcastNotification(args);
  assert.equal(duplicate.payload.delivered, 0);
  assert.equal(duplicate.payload.suppressedDuplicates, 2);
  assert.equal(firebaseCalls, deliveredCalls, "completed rows must still prevent spam");
});

test("a stalled FCM request stays bounded without reopening a possible delivery", async () => {
  let reservationPresent = false;
  let stallFcm = true;
  let firebaseCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith("https://supabase.example/rest/v1/push_devices?")) {
      return Response.json([
        { id: "device-1", user_id: "user-1", token: "token-1", platform: "ios" }
      ]);
    }
    if (target.includes("/rest/v1/broadcast_notification_deliveries")) {
      if (options.method === "POST") {
        if (reservationPresent) return Response.json([]);
        reservationPresent = true;
        return Response.json(JSON.parse(options.body));
      }
      if (options.method === "DELETE") {
        reservationPresent = false;
        return new Response(null, { status: 204 });
      }
      return Response.json(reservationPresent ? [{ delivered_at: null }] : []);
    }
    if (target.includes("fcm.googleapis.com")) {
      firebaseCalls += 1;
      return stallFcm
        ? new Promise(() => {})
        : Response.json({ name: "must-not-be-sent-twice" });
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${target}`);
  };
  const startedAt = Date.now();
  const result = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "stalled-campaign",
    fetchImpl,
    deliveryTimeoutMs: 15,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "firebase-project"
    })
  });

  assert.equal(result.status, 502);
  assert.equal(reservationPresent, true);
  assert.equal(firebaseCalls, 1);
  assert.ok(Date.now() - startedAt < 500, "a stalled provider must stay bounded");

  stallFcm = false;
  const retry = await sendBroadcastNotification({
    env,
    authorization: `Bearer ${broadcastAuthorizationToken(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    title: "Test",
    body: "Test body",
    campaignId: "stalled-campaign",
    fetchImpl,
    deliveryTimeoutMs: 15,
    accessTokenProvider: async () => ({
      accessToken: "firebase-access-token",
      projectId: "firebase-project"
    })
  });
  assert.equal(retry.status, 502, "an unknown delivery must not become false success");
  assert.equal(retry.payload.delivered, 0);
  assert.equal(retry.payload.suppressedDuplicates, 0);
  assert.equal(firebaseCalls, 1, "an ambiguous send must never be repeated automatically");
});

test("broadcast notification route passes the protected request to the service", async () => {
  let received;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    broadcastNotificationService: async (request) => {
      received = request;
      return {
        status: 200,
        payload: { ok: true, delivered: 2 }
      };
    }
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/admin/notifications/broadcast`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer admin-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: "Title",
          body: "Body",
          campaignId: "campaign-one"
        })
      }
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).delivered, 2);
    assert.equal(received.authorization, "Bearer admin-token");
    assert.equal(received.title, "Title");
    assert.equal(received.body, "Body");
    assert.equal(received.campaignId, "campaign-one");
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
