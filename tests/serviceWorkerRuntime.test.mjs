import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function createWorker({
  fetchImpl,
  cachePut = async () => {},
  shell = new Response("offline shell", { status: 200 })
} = {}) {
  const source = await readFile("sw.js", "utf8");
  const listeners = new Map();
  const fetchCalls = [];
  const cacheWrites = [];
  let skipWaitingCalls = 0;
  const cache = {
    async addAll() {},
    async put(request, response) {
      cacheWrites.push({ request, response });
      return cachePut(request, response);
    }
  };
  const caches = {
    async open() {
      return cache;
    },
    async keys() {
      return [];
    },
    async delete() {
      return true;
    },
    async match(request) {
      const url = typeof request === "string" ? request : new URL(request.url).pathname;
      return url === "/index.html" ? shell.clone() : undefined;
    }
  };
  const fetch = (...args) => {
    fetchCalls.push(args);
    return fetchImpl?.(...args) ?? Promise.resolve(new Response("fresh", { status: 200 }));
  };

  vm.runInNewContext(source, {
    self: {
      location: { origin: "https://sogrim-hesbon-app.vercel.app" },
      clients: { claim: async () => {} },
      skipWaiting: async () => {
        skipWaitingCalls += 1;
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    },
    caches,
    fetch,
    URL,
    Response,
    Promise
  });

  return {
    fetchCalls,
    cacheWrites,
    get skipWaitingCalls() {
      return skipWaitingCalls;
    },
    dispatchInstall() {
      let installPromise;
      listeners.get("install")({
        waitUntil(value) {
          installPromise = Promise.resolve(value);
        }
      });
      return installPromise;
    },
    dispatchFetch(request) {
      let responsePromise;
      listeners.get("fetch")({
        request,
        respondWith(value) {
          responsePromise = Promise.resolve(value);
        }
      });
      return responsePromise;
    },
    dispatchMessage(data) {
      listeners.get("message")?.({ data });
    }
  };
}

test("a new service worker bypasses stale HTTP caches while rebuilding its app shell", async () => {
  const worker = await createWorker();

  await worker.dispatchInstall();

  assert.ok(worker.fetchCalls.length > 20);
  assert.ok(worker.fetchCalls.every(([url, init]) => {
    const parsed = new URL(String(url));
    return parsed.searchParams.get("pwa_release") === "348" && init?.cache === "no-store";
  }));
  assert.ok(worker.cacheWrites.some(({ request }) => request === "/index.html"));
  assert.ok(worker.cacheWrites.some(({ request }) => request === "/src/pwaBootstrap.mjs"));
});

test("installed-app navigations bypass Safari's stale HTTP cache", async () => {
  const worker = await createWorker();
  const request = {
    url: "https://sogrim-hesbon-app.vercel.app/?pwa_release=348",
    method: "GET",
    mode: "navigate",
    headers: new Headers()
  };

  const response = await worker.dispatchFetch(request);

  assert.equal(await response.text(), "fresh");
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.fetchCalls[0][1]?.cache, "no-store");
});

test("installed-app modules also bypass Safari's stale HTTP cache", async () => {
  const worker = await createWorker();
  const response = await worker.dispatchFetch(
    new Request("https://sogrim-hesbon-app.vercel.app/src/app.mjs")
  );

  assert.equal(await response.text(), "fresh");
  assert.equal(worker.fetchCalls[0][1]?.cache, "no-store");
});

test("a waiting worker can be activated explicitly on iPhone", async () => {
  const worker = await createWorker();

  worker.dispatchMessage({ type: "SKIP_WAITING" });

  assert.equal(worker.skipWaitingCalls, 1);
});

test("service worker bypasses cross-origin resources and API calls", async () => {
  const worker = await createWorker();

  assert.equal(
    worker.dispatchFetch(new Request("https://accounts.google.com/gsi/client")),
    undefined
  );
  assert.equal(
    worker.dispatchFetch(new Request("https://sogrim-hesbon-app.vercel.app/api/config")),
    undefined
  );
  assert.equal(worker.fetchCalls.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
});

test("service worker never stores range responses used by the intro video", async () => {
  const worker = await createWorker({
    fetchImpl: async () =>
      new Response("partial", {
        status: 206,
        headers: { "content-range": "bytes 0-6/20" }
      })
  });
  const response = await worker.dispatchFetch(
    new Request("https://sogrim-hesbon-app.vercel.app/assets/sogrim-logo-intro.mp4", {
      headers: { range: "bytes=0-6" }
    })
  );

  assert.equal(response.status, 206);
  assert.equal(await response.text(), "partial");
  assert.equal(worker.cacheWrites.length, 0);
});

test("a cache write failure never hides a valid network response", async () => {
  const worker = await createWorker({
    fetchImpl: async () => new Response("latest app", { status: 200 }),
    cachePut: async () => {
      throw new Error("quota exceeded");
    }
  });
  const response = await worker.dispatchFetch(
    new Request("https://sogrim-hesbon-app.vercel.app/src/app.mjs")
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "latest app");
  assert.equal(worker.cacheWrites.length, 1);
});

test("private query and compact invites use no-store and fall back to the shell offline", async () => {
  const worker = await createWorker({
    fetchImpl: () => Promise.reject(new Error("offline"))
  });
  const privateUrls = [
    "https://sogrim-hesbon-app.vercel.app/?event=e1&key=" + "a".repeat(40),
    "https://sogrim-hesbon-app.vercel.app/i/e1/space-safe/" + "b".repeat(40)
  ];

  for (const url of privateUrls) {
    const response = await worker.dispatchFetch(new Request(url));
    assert.equal(await response.text(), "offline shell");
  }

  assert.equal(worker.cacheWrites.length, 0);
  assert.equal(worker.fetchCalls.length, 2);
  assert.ok(worker.fetchCalls.every(([, init]) => init?.cache === "no-store"));
});
