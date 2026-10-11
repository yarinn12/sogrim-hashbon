import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");

async function activateUpdatedWorker({ oldPageReloads, reportsClientId = true, safeReply = null }) {
  const listeners = new Map();
  const responses = [];
  const navigationCalls = [];
  const client = {
    id: "existing-window",
    url: "https://pwa-qa.example.test/",
    navigate(url) {
      navigationCalls.push(url);
      return Promise.resolve(client);
    }
  };
  if (safeReply !== null) {
    client.postMessage = (_message, [port]) => port.postMessage({ safe: safeReply });
  }
  const self = {
    location: { origin: "https://pwa-qa.example.test" },
    addEventListener(type, listener) { listeners.set(type, listener); },
    clients: {
      async claim() {
        if (!oldPageReloads) return;
        listeners.get("fetch")({
          replacesClientId: reportsClientId ? client.id : "",
          request: {
            method: "GET", mode: "navigate", url: client.url,
            headers: { has: () => false }
          },
          respondWith(response) { responses.push(Promise.resolve(response)); }
        });
      },
      async matchAll() { return [client]; },
      async get(id) { return id === client.id ? client : undefined; }
    }
  };
  const caches = {
    async keys() { return ["settle-friends-live-v510", "settle-friends-live-v514"]; },
    async delete() { return true; },
    async match() { return null; },
    async open() { return { put: async () => {} }; }
  };
  runInNewContext(workerSource, {
    self, caches, URL, Response, AbortController, MessageChannel, setTimeout, clearTimeout,
    fetch: async () => new Response("<html></html>", {
      status: 200, headers: { "content-type": "text/html" }
    })
  });
  let activation;
  listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;
  await Promise.all(responses);
  return navigationCalls;
}

test("an updating worker does not navigate a page already reloading on controllerchange", async () => {
  assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: true }), []);
});

test("an updating worker leaves an unresponsive older page open", async () => {
  assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: false }), []);
});

test("an updating worker navigates a page after an explicit safe reply", async () => {
  assert.deepEqual(await activateUpdatedWorker({ oldPageReloads: false, safeReply: true }), [
    "https://pwa-qa.example.test/"
  ]);
});

test("a single reloading page is not navigated twice when the browser omits its client id", async () => {
  assert.deepEqual(await activateUpdatedWorker({
    oldPageReloads: true, reportsClientId: false
  }), []);
});
