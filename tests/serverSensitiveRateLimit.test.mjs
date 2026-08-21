import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";

test("sensitive API routes are throttled before service execution", async () => {
  let serviceCalls = 0;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    paymentReminderService: async () => {
      serviceCalls += 1;
      return { status: 200, payload: { ok: true } };
    }
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const endpoint = `http://127.0.0.1:${port}/api/notifications/payment-reminder`;
    for (let index = 0; index < 60; index += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: `event-${index}`, transferId: "transfer" })
      });
      assert.equal(response.status, 200);
    }

    const throttled = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{".repeat(10_000)
    });
    assert.equal(throttled.status, 429);
    assert.ok(Number(throttled.headers.get("retry-after")) >= 1);
    assert.equal((await throttled.json()).code, "RATE_LIMITED");
    assert.equal(serviceCalls, 60);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("rate limits are isolated by sensitive route", async () => {
  let inviteCalls = 0;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    openEventInviteService: async () => {
      inviteCalls += 1;
      return { status: 200, payload: { ok: true } };
    }
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/event-invites/open-link`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: "event-one", operation: "ensure" })
      }
    );
    assert.equal(response.status, 200);
    assert.equal(inviteCalls, 1);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("deployed sensitive routes reserve shared durable capacity", async () => {
  let serviceCalls = 0;
  let durableRequest;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    durableRateLimitRequired: true,
    durableApiRateLimitService: async (request) => {
      durableRequest = request;
      return { available: true, allowed: true, retryAfterSeconds: 0 };
    },
    paymentReminderService: async () => {
      serviceCalls += 1;
      return { status: 200, payload: { ok: true } };
    }
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/notifications/payment-reminder`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer private-session-value",
          "content-type": "application/json"
        },
        body: JSON.stringify({ eventId: "event-one", transferId: "transfer" })
      }
    );
    assert.equal(response.status, 200);
    assert.equal(serviceCalls, 1);
    assert.match(durableRequest.namespace, /^sensitive-api:/);
    assert.equal(durableRequest.subjectHashes.length, 2);
    assert.equal(
      durableRequest.subjectHashes.every((value) => /^[a-f0-9]{64}$/.test(value)),
      true
    );
    assert.equal(JSON.stringify(durableRequest).includes("private-session-value"), false);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("deployed sensitive routes fail closed when durable protection is unavailable", async () => {
  let serviceCalls = 0;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    durableRateLimitRequired: true,
    durableApiRateLimitService: async () => ({
      available: false,
      allowed: false,
      retryAfterSeconds: 1
    }),
    paymentReminderService: async () => {
      serviceCalls += 1;
      return { status: 200, payload: { ok: true } };
    }
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/notifications/payment-reminder`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: "event-one", transferId: "transfer" })
      }
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "RATE_LIMIT_UNAVAILABLE");
    assert.equal(serviceCalls, 0);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
