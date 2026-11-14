import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, Agent } from "node:http";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resetLocalQaStateFresh } from "../e2e/helpers/resetLocalQaStateFresh.mjs";

const spec = readFileSync(new URL("../e2e/paused-zero-screenshot.spec.mjs", import.meta.url), "utf8");

function registeredScreenshotTest() {
  let callback;
  const register = (name, body) => {
    assert.match(name, /event screenshot preserves its paused infinite animation/);
    assert.equal(callback, undefined, "Expected one registered screenshot case");
    callback = body;
  };
  register.use = () => {};
  const expect = value => ({ toBe: expected => assert.equal(value, expected) });
  // Imports are supplied by the test harness. Execute the registered callback,
  // rather than checking the spec text for a particular reset helper name.
  const body = spec.replace(/^import .*;\r?\n/gm, "");
  runInNewContext(body, {
    test: register, expect, resetLocalQaStateFresh,
    capturePausedZeroScreenshot: () => { throw new Error("Screenshot reached before reset boundary assertion"); },
    openTypographyHome: () => { throw new Error("Page reached before reset boundary assertion"); }
  }, { filename: "paused-zero-screenshot.spec.mjs" });
  assert.equal(typeof callback, "function");
  return callback;
}

async function serverFixture(t, respond) {
  const calls = [], uses = new WeakMap();
  const server = createServer((incoming, response) => {
    const use = (uses.get(incoming.socket) ?? 0) + 1;
    uses.set(incoming.socket, use);
    calls.push({ method: incoming.method, path: incoming.url, use });
    respond(incoming, response, use);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  t.after(async () => {
    agent.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { baseURL: `http://127.0.0.1:${server.address().port}`, calls, agent };
}

function pooledRequest(baseURL, agent) {
  const send = (method, path) => new Promise((resolve, reject) => {
    const outgoing = httpRequest(new URL(path, baseURL), { method, agent }, response => {
      response.once("error", reject);
      response.once("aborted", () => reject(new Error("Response aborted")));
      response.once("end", () => resolve({ ok: () => response.statusCode >= 200 && response.statusCode < 300 }));
      response.resume();
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
  return { send, post: path => send("POST", path) };
}

async function runThroughReset(callback, fixture) {
  const sentinel = new Error("Reached state seeding after acknowledged reset");
  let stateWrites = 0, pooledPosts = 0;
  const pool = pooledRequest(fixture.baseURL, fixture.agent);
  const request = {
    post: path => { pooledPosts++; return pool.post(path); },
    put: async () => { stateWrites++; throw sentinel; }
  };
  let outcome;
  try { await callback({ page: {}, request, baseURL: fixture.baseURL }, {}); }
  catch (error) { outcome = error; }
  return { outcome, sentinel, stateWrites, pooledPosts, pool };
}

test("the screenshot spec resets on a fresh connection after a pooled socket becomes unusable", async t => {
  const fixture = await serverFixture(t, (incoming, response, use) => {
    if (incoming.url === "/prime") { response.end("primed"); return; }
    assert.equal(incoming.url, "/api/reset");
    if (use > 1) incoming.socket.destroy();
    else response.end("reset acknowledged");
  });
  const pool = pooledRequest(fixture.baseURL, fixture.agent);
  await pool.send("GET", "/prime");
  assert.ok(Object.values(fixture.agent.freeSockets).some(sockets => sockets.length > 0),
    "The old request boundary must have an available pooled socket");
  const result = await runThroughReset(registeredScreenshotTest(), fixture);
  assert.equal(result.outcome, result.sentinel, "Reset must be acknowledged before state seeding");
  assert.equal(result.stateWrites, 1);
  assert.equal(result.pooledPosts, 0, "The screenshot spec must not reset through the shared request pool");
  assert.deepEqual(fixture.calls, [
    { method: "GET", path: "/prime", use: 1 },
    { method: "POST", path: "/api/reset", use: 1 }
  ]);
});

for (const [name, respond, message] of [
  ["first socket reset", incoming => incoming.socket.destroy(), /socket hang up|ECONNRESET/],
  ["HTTP 500", (_incoming, response) => { response.writeHead(500); response.end("failure"); }, /HTTP 500/],
  ["redirect", (_incoming, response) => { response.writeHead(302, { Location: "/unexpected" }); response.end(); }, /HTTP 302/],
  ["partial response", (_incoming, response) => {
    response.writeHead(200, { "content-length": "20" });
    response.write("partial");
    response.socket.destroy();
  }, /aborted|ECONNRESET|socket hang up/]
]) test(`the screenshot spec stops on ${name} without a reset retry`, async t => {
  const fixture = await serverFixture(t, respond);
  const result = await runThroughReset(registeredScreenshotTest(), fixture);
  assert.match(String(result.outcome), message);
  assert.equal(result.stateWrites, 0);
  assert.equal(result.pooledPosts, 0);
  assert.deepEqual(fixture.calls, [{ method: "POST", path: "/api/reset", use: 1 }]);
});
