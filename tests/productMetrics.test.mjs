import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";
import {
  normalizeProductMetricBatch,
  sanitizeClientError
} from "../src/domain/productMetrics.mjs";
import { startProductMetricTransport } from "../src/data/productMetrics.mjs";
import {
  purgeExpiredProductMetrics,
  storeProductMetrics
} from "../src/server/productMetrics.mjs";

const NOW = Date.parse("2026-08-03T09:00:00.000Z");
const METRIC_ID = "8e842107-f250-44ed-aec0-5993ca53d9f1";
const SESSION_ID = "6fa90b11-b6af-42f4-b566-d16df6e313a5";
const runtimeConfig = {
  storage: {
    mode: "supabase",
    url: "https://project.supabase.co",
    anonKey: "anon-key"
  }
};

test("product metrics accept only the documented aggregate vocabulary", () => {
  const [metric] = normalizeProductMetricBatch({
    events: [{
      id: METRIC_ID,
      sessionId: SESSION_ID,
      eventName: "event_created",
      screen: "new_event",
      platform: "android",
      appVersion: "1.7.0",
      buildNumber: 84,
      detail: "trip",
      occurredAt: "2026-08-03T08:59:00.000Z"
    }]
  }, { now: () => NOW });

  assert.deepEqual(metric, {
    id: METRIC_ID,
    sessionId: SESSION_ID,
    eventName: "event_created",
    screen: "new_event",
    platform: "android",
    appVersion: "1.7.0",
    buildNumber: 84,
    detail: "trip",
    occurredAt: "2026-08-03T08:59:00.000Z"
  });
});

test("product metrics reject identifiers, names, amounts, links and arbitrary details", () => {
  const sensitiveFields = [
    ["userId", "account-123"],
    ["eventId", "event-secret"],
    ["eventNameText", "הטיול של ירין"],
    ["amount", 82],
    ["email", "person@example.com"],
    ["url", "https://example.com/?invite=secret"]
  ];

  for (const [key, value] of sensitiveFields) {
    assert.throws(() => normalizeProductMetricBatch({
      events: [{
        id: METRIC_ID,
        eventName: "expense_created",
        screen: "expense",
        platform: "web",
        appVersion: "",
        buildNumber: 0,
        detail: "",
        occurredAt: "2026-08-03T08:59:00.000Z",
        [key]: value
      }]
    }, { now: () => NOW }), /unsupported fields/);
  }
});

test("client error sanitizer never keeps messages, stack traces or full paths", () => {
  const detail = sanitizeClientError({
    error: {
      name: "TypeError",
      message: "Failed for yarinn12@gmail.com at event-secret",
      stack: "https://private.example/path?invite=secret"
    },
    filename: "https://sogrim-hesbon-app.vercel.app/src/app.mjs?event=secret",
    line: 123
  });

  assert.match(detail, /^TypeError:app:100:0:[0-9a-f]{8}$/);
  assert.doesNotMatch(detail, /yarin|private|secret|https|app\.mjs/i);
});

test("metrics server verifies auth then stores a privacy-safe service-role row", async () => {
  const requests = [];
  const result = await storeProductMetrics({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer user-access-token",
    payload: metricPayload(),
    now: () => NOW,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, {
          id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2",
          email: "private@example.com"
        });
      }
      if (url.endsWith("/rest/v1/rpc/reserve_product_metric_batch")) {
        return jsonResponse(200, true);
      }
      return jsonResponse(204, null);
    }
  });

  assert.equal(result.status, 202);
  assert.equal(result.payload.accepted, 1);
  assert.equal(requests[0].options.headers.apikey, "anon-key");
  const insert = requests.find(({ url }) => url.includes("/rest/v1/product_metrics?on_conflict=id"));
  assert.ok(insert);
  const reservation = requests.find(({ url }) => url.endsWith("/rpc/reserve_product_metric_batch"));
  assert.ok(reservation);
  assert.deepEqual(JSON.parse(reservation.options.body), {
    p_user_id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2",
    p_event_count: 1,
    p_window_seconds: 60,
    p_event_limit: 120
  });
  assert.equal(insert.options.headers.apikey, "service-key");
  const [row] = JSON.parse(insert.options.body);
  assert.deepEqual(Object.keys(row).sort(), [
    "app_version",
    "build_number",
    "detail",
    "event_name",
    "id",
    "occurred_at",
    "platform",
    "screen",
    "session_id"
  ]);
  assert.match(row.session_id, /^[0-9a-f-]{36}$/i);
  assert.doesNotMatch(JSON.stringify(row), /private@example|2f1fcf8b|user-access-token/);
});

test("metrics server rejects an authenticated event storm before storing rows", async () => {
  const requests = [];
  const result = await storeProductMetrics({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer user-access-token",
    payload: metricPayload(),
    now: () => NOW,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2" });
      }
      if (url.endsWith("/rest/v1/rpc/reserve_product_metric_batch")) {
        return jsonResponse(200, false);
      }
      return jsonResponse(204, null);
    }
  });

  assert.equal(result.status, 429);
  assert.equal(
    requests.some(({ url }) => url.includes("/rest/v1/product_metrics?on_conflict=id")),
    false
  );
});

test("daily retention removes product metrics older than 90 days", async () => {
  let deletion = null;
  const result = await purgeExpiredProductMetrics({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    now: () => NOW,
    fetchImpl: async (url, options) => {
      deletion = { url, options };
      return jsonResponse(204, null);
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.retentionDays, 90);
  assert.match(deletion.url, /product_metrics\?received_at=lt\./);
  assert.equal(deletion.options.method, "DELETE");
  assert.equal(deletion.options.headers.apikey, "service-key");
});

test("retention HTTP route requires the configured cron secret", async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-test-secret";
  let calls = 0;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    productMetricsRetentionService: async () => {
      calls += 1;
      return { status: 200, payload: { ok: true, retentionDays: 90 } };
    }
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const endpoint = `http://127.0.0.1:${address.port}/api/maintenance/retention`;
    assert.equal((await fetch(endpoint)).status, 401);
    const response = await fetch(endpoint, {
      headers: { authorization: "Bearer cron-test-secret" }
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

test("metrics server rejects invalid fields before contacting Supabase", async () => {
  let called = false;
  const payload = metricPayload();
  payload.events[0].eventId = "event-private";
  const result = await storeProductMetrics({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer token",
    payload,
    fetchImpl: async () => {
      called = true;
      return jsonResponse(200, {});
    }
  });

  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test("product metrics HTTP route keeps the service boundary injectable", async () => {
  let received = null;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    productMetricsService: async (input) => {
      received = input;
      return { status: 202, payload: { ok: true, accepted: 1 } };
    }
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/product-metrics`, {
      method: "POST",
      headers: {
        authorization: "Bearer route-token",
        "content-type": "application/json"
      },
      body: JSON.stringify(metricPayload())
    });
    assert.equal(response.status, 202);
    assert.equal(received.authorization, "Bearer route-token");
    assert.equal(received.payload.events[0].eventName, "expense_created");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("product metrics retry transient failures and drain large queues in bounded batches", async () => {
  const requests = [];
  let attempts = 0;
  const harness = createTransportHarness({
    fetchImpl: async (_url, options) => {
      attempts += 1;
      requests.push(JSON.parse(options.body).events);
      return { ok: attempts > 1, status: attempts > 1 ? 202 : 503 };
    }
  });

  const stop = startProductMetricTransport(harness.options);
  for (let index = 0; index < 44; index += 1) {
    harness.documentRef.emit("sogrim:product-metric", {
      detail: { eventName: "expense_started", screen: "expense" }
    });
  }

  await harness.runNextTimer();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].length, 20);
  assert.equal(harness.timerCount(), 1, "a transient failure should schedule a retry");

  await harness.runNextTimer();
  await harness.runNextTimer();
  await harness.runNextTimer();
  assert.deepEqual(requests.map((batch) => batch.length), [20, 20, 20, 5]);
  assert.equal(harness.timerCount(), 0);
  stop();
});

test("product metrics collapse identical client error storms without losing later errors", async () => {
  const requests = [];
  let currentTime = NOW;
  const harness = createTransportHarness({
    now: () => currentTime,
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body).events);
      return { ok: true, status: 202 };
    }
  });

  const stop = startProductMetricTransport(harness.options);
  const repeatedError = {
    error: { name: "TypeError", message: "private content" },
    filename: "https://sogrim-hesbon-app.vercel.app/src/app.mjs?event=private",
    lineno: 123
  };
  harness.windowRef.emit("error", repeatedError);
  harness.windowRef.emit("error", repeatedError);
  await harness.runNextTimer();

  assert.equal(requests[0].filter(({ eventName }) => eventName === "client_error").length, 1);
  currentTime += 30_000;
  harness.windowRef.emit("error", repeatedError);
  await harness.runNextTimer();
  assert.equal(requests[1].filter(({ eventName }) => eventName === "client_error").length, 1);
  const allEvents = requests.flat();
  assert.equal(new Set(allEvents.map(({ sessionId }) => sessionId)).size, 1);
  assert.doesNotMatch(JSON.stringify(requests), /private content|event=private/);
  stop();
});

test("operation failures accept only a fixed privacy-safe vocabulary", () => {
  const [metric] = normalizeProductMetricBatch({
    events: [{
      ...metricPayload().events[0],
      eventName: "operation_failure",
      screen: "home",
      detail: "friend_network"
    }]
  }, { now: () => NOW });
  assert.equal(metric.detail, "friend_network");

  assert.throws(() => normalizeProductMetricBatch({
    events: [{
      ...metricPayload().events[0],
      eventName: "operation_failure",
      detail: "failed for private@example.com"
    }]
  }, { now: () => NOW }), /Operation detail is invalid/);
});

function metricPayload() {
  return {
    events: [{
      id: METRIC_ID,
      eventName: "expense_created",
      screen: "expense",
      platform: "android",
      appVersion: "1.7.0",
      buildNumber: 84,
      detail: "",
      occurredAt: "2026-08-03T08:59:00.000Z"
    }]
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function createTransportHarness({ fetchImpl, now = () => NOW } = {}) {
  const timers = new Map();
  let timerId = 0;
  const createEventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(type, listener) {
        const current = listeners.get(type) ?? new Set();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      emit(type, event = {}) {
        for (const listener of listeners.get(type) ?? []) listener(event);
      }
    };
  };
  const documentRef = {
    ...createEventTarget(),
    visibilityState: "visible",
    querySelector() {
      return { dataset: { screen: "expense" } };
    }
  };
  const windowRef = {
    ...createEventTarget(),
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  };
  const storage = {
    getItem(key) {
      if (key !== "settle-friends-account-session") return null;
      return JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token" });
    }
  };

  return {
    documentRef,
    windowRef,
    timerCount: () => timers.size,
    async runNextTimer() {
      const next = timers.entries().next().value;
      assert.ok(next, "expected a scheduled product metric flush");
      const [id, timer] = next;
      timers.delete(id);
      await timer.callback();
    },
    options: {
      documentRef,
      windowRef,
      storage,
      fetchImpl,
      now,
      cryptoRef: globalThis.crypto
    }
  };
}
