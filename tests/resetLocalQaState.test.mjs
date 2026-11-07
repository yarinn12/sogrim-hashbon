import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request } from "@playwright/test";
import { resetLocalQaState } from "../e2e/helpers/resetLocalQaState.mjs";

async function fixture(t, respond) {
  const calls = [];
  const server = createServer((incoming, response) => {
    calls.push({ method: incoming.method, url: incoming.url });
    respond(incoming, response, calls.length);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const client = await request.newContext();
  t.after(async () => {
    await client.dispose();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { client, calls, baseURL: `http://127.0.0.1:${server.address().port}` };
}

test("healthy QA reset is sent once to the local reset endpoint", async t => {
  const h = await fixture(t, (_, response) => response.end("ok"));
  const response = await resetLocalQaState(h.client, h.baseURL);
  assert.equal(response.status(), 200);
  assert.deepEqual(h.calls, [{ method: "POST", url: "/api/reset" }]);
});

test("QA reset recovers from one real connection reset", async t => {
  const h = await fixture(t, (incoming, response, attempt) => {
    if (attempt === 1) incoming.socket.destroy();
    else response.end("ok");
  });
  const response = await resetLocalQaState(h.client, h.baseURL);
  assert.equal(response.status(), 200);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.method === "POST" && call.url === "/api/reset"));
});

test("repeated QA reset disconnects still fail after one retry", async t => {
  const h = await fixture(t, incoming => incoming.socket.destroy());
  await assert.rejects(resetLocalQaState(h.client, h.baseURL), /socket hang up|ECONNRESET/);
  assert.equal(h.calls.length, 2);
});

for (const status of [503, 302]) {
  test(`QA reset does not retry or follow HTTP ${status}`, async t => {
    const h = await fixture(t, (_, response) => {
      response.writeHead(status, status === 302 ? { Location: "/unexpected-reset" } : {});
      response.end("unavailable");
    });
    await assert.rejects(resetLocalQaState(h.client, h.baseURL), new RegExp(`HTTP ${status}`));
    assert.deepEqual(h.calls, [{ method: "POST", url: "/api/reset" }]);
  });
}

test("QA reset refuses a remote server before making a request", async () => {
  let calls = 0;
  const client = { post: async () => { calls++; throw new Error("unexpected network request"); } };
  await assert.rejects(resetLocalQaState(client, "https://example.com"), /local loopback/);
  assert.equal(calls, 0);
});
