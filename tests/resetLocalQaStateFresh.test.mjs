import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resetLocalQaStateFresh } from "../e2e/helpers/resetLocalQaStateFresh.mjs";

async function fixture(t, respond) {
  const calls = [];
  const socketUses = new WeakMap();
  const server = createServer((incoming, response) => {
    const use = (socketUses.get(incoming.socket) ?? 0) + 1;
    socketUses.set(incoming.socket, use);
    calls.push({ method: incoming.method, url: incoming.url, use });
    respond(incoming, response, use, calls.length);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { calls, baseURL: `http://127.0.0.1:${server.address().port}` };
}

test("each QA reset uses a new connection even when the prior one remains reusable", async t => {
  const h = await fixture(t, (incoming, response, use) => {
    if (use > 1) incoming.socket.destroy();
    else response.end("ok");
  });
  await resetLocalQaStateFresh(h.baseURL);
  await resetLocalQaStateFresh(h.baseURL);
  assert.deepEqual(h.calls, [
    { method: "POST", url: "/api/reset", use: 1 },
    { method: "POST", url: "/api/reset", use: 1 }
  ]);
});

test("a real first-request connection reset fails without a retry", async t => {
  const h = await fixture(t, incoming => incoming.socket.destroy());
  await assert.rejects(resetLocalQaStateFresh(h.baseURL), /socket hang up|ECONNRESET/);
  assert.deepEqual(h.calls, [{ method: "POST", url: "/api/reset", use: 1 }]);
});

test("a reset before the full HTTP response is acknowledged fails", async t => {
  const h = await fixture(t, (incoming, response) => {
    response.writeHead(200, { "content-length": "10" });
    response.write("partial");
    response.socket.destroy();
  });
  await assert.rejects(resetLocalQaStateFresh(h.baseURL), /aborted|ECONNRESET|socket hang up/);
  assert.equal(h.calls.length, 1);
});

for (const status of [500, 302]) {
  test(`QA reset fails on HTTP ${status} without following or retrying`, async t => {
    const h = await fixture(t, (_, response) => {
      response.writeHead(status, status === 302 ? { Location: "/unexpected-reset" } : {});
      response.end("failure");
    });
    await assert.rejects(resetLocalQaStateFresh(h.baseURL), new RegExp(`HTTP ${status}`));
    assert.deepEqual(h.calls, [{ method: "POST", url: "/api/reset", use: 1 }]);
  });
}

test("QA reset refuses remote and credentialed targets", async () => {
  await assert.rejects(resetLocalQaStateFresh("http://example.com"), /local loopback/);
  await assert.rejects(resetLocalQaStateFresh("https://example.com"), /local loopback/);
  await assert.rejects(resetLocalQaStateFresh("http://user:pass@127.0.0.1:4182"), /local loopback/);
});
