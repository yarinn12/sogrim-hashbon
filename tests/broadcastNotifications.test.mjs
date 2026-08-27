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

test("broadcast notifications deliver once per enabled device token", async () => {
  const firebaseMessages = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
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
    disabledInvalid: 0
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
