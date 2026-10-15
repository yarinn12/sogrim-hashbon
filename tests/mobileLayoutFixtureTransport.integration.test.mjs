import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request as playwrightRequest } from "@playwright/test";
import { prepareMobileLayoutFixture } from "../e2e/helpers/prepareMobileLayoutFixture.mjs";

async function fixture(t, respond) {
  const calls = [];
  const socketUses = new WeakMap();
  const server = createServer((incoming, response) => {
    const use = (socketUses.get(incoming.socket) ?? 0) + 1;
    socketUses.set(incoming.socket, use);
    calls.push({ method: incoming.method, path: incoming.url, use });
    respond(incoming, response, use);
  });
  server.keepAliveTimeout = 30_000;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const client = await playwrightRequest.newContext({ baseURL });
  t.after(async () => {
    await client.dispose();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { calls, baseURL, client };
}

test("mobile-layout setup writes acknowledged state after a stale Playwright socket is rejected", async t => {
  const state = { synthetic: "mobile-layout", events: [] };
  let stored = null;
  let writeAcknowledged = false;
  const h = await fixture(t, async (incoming, response, use) => {
    if (use > 1) {
      incoming.socket.destroy();
      return;
    }
    if (incoming.url === "/prime") {
      response.end("warm");
      return;
    }
    if (incoming.url === "/api/reset") {
      stored = { reset: true };
      response.end(JSON.stringify(stored));
      return;
    }
    if (incoming.url === "/api/state" && incoming.method === "PUT") {
      let body = "";
      for await (const chunk of incoming) body += chunk;
      stored = JSON.parse(body);
      response.on("finish", () => { writeAcknowledged = true; });
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404).end();
  });

  assert.equal((await h.client.get("/prime")).status(), 200);
  try {
    await prepareMobileLayoutFixture({ request: h.client, baseURL: h.baseURL, state });
  } catch (error) {
    t.diagnostic(JSON.stringify(h.calls));
    throw error;
  }
  assert.deepEqual(stored, state);
  assert.equal(writeAcknowledged, true);
  assert.deepEqual(h.calls, [
    { method: "GET", path: "/prime", use: 1 },
    { method: "POST", path: "/api/reset", use: 1 },
    { method: "PUT", path: "/api/state", use: 1 }
  ]);
});

test("mobile-layout setup fails on a first-request reset disconnect without retrying or writing state", async t => {
  const h = await fixture(t, incoming => incoming.socket.destroy());
  await assert.rejects(
    prepareMobileLayoutFixture({ baseURL: h.baseURL, state: { synthetic: true } }),
    /socket hang up|ECONNRESET/
  );
  assert.deepEqual(h.calls, [{ method: "POST", path: "/api/reset", use: 1 }]);
});

for (const [name, reply, message] of [
  ["disconnected state write", (_, response) => response.socket.destroy(), /socket hang up|ECONNRESET/],
  ["partial state acknowledgement", (_, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-length": "20" });
    response.write('{"ok":true}');
    response.socket.destroy();
  }, /aborted|closed before acknowledgement|ECONNRESET|socket hang up/],
  ["negative state acknowledgement", (_, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":false}');
  }, /not acknowledged/],
  ["HTTP error acknowledgement", (_, response) => {
    response.writeHead(503, { "content-type": "application/json" });
    response.end('{"ok":false}');
  }, /HTTP 503/]
]) {
  test(`mobile-layout setup rejects ${name} before initialization`, async t => {
    let continued = false;
    const h = await fixture(t, (incoming, response) => {
      if (incoming.url === "/api/reset") {
        response.end('{"reset":true}');
      } else {
        reply(incoming, response);
      }
    });
    await assert.rejects(
      (async () => {
        await prepareMobileLayoutFixture({ baseURL: h.baseURL, state: { synthetic: true } });
        continued = true;
      })(),
      message
    );
    assert.equal(continued, false);
    assert.deepEqual(h.calls, [
      { method: "POST", path: "/api/reset", use: 1 },
      { method: "PUT", path: "/api/state", use: 1 }
    ]);
  });
}

test("mobile-layout setup refuses remote fixture origins", async () => {
  await assert.rejects(
    prepareMobileLayoutFixture({ baseURL: "https://example.com", state: {} }),
    /local loopback/
  );
});

test("mobile-layout setup aborts a stalled real HTTP PUT at the existing deadline", async t => {
  let continued = false;
  const h = await fixture(t, (incoming, response) => {
    if (incoming.url === "/api/reset") {
      response.end('{"reset":true}');
      return;
    }
    // Keep the real PUT socket unanswered. The watchdog only frees the old
    // implementation, which otherwise has no deadline and would hang forever.
    setTimeout(() => incoming.socket.destroy(), 250).unref();
  });
  const originalTimeout = AbortSignal.timeout;
  const timeoutBudgets = [];
  t.mock.method(AbortSignal, "timeout", milliseconds => {
    timeoutBudgets.push(milliseconds);
    return originalTimeout(timeoutBudgets.length === 2 ? 25 : milliseconds);
  });

  await assert.rejects(
    (async () => {
      await prepareMobileLayoutFixture({ baseURL: h.baseURL, state: { synthetic: true } });
      continued = true;
    })(),
    error => {
      assert.deepEqual(timeoutBudgets, [30_000, 30_000]);
      assert.equal(error.name, "AbortError");
      return true;
    }
  );
  assert.equal(continued, false);
  assert.deepEqual(h.calls, [
    { method: "POST", path: "/api/reset", use: 1 },
    { method: "PUT", path: "/api/state", use: 1 }
  ]);
});
