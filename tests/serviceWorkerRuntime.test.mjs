import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function createWorker({
  fetchImpl,
  cachePut = async () => {},
  cacheNames = [],
  windowClients = [],
  shell = new Response("offline shell", { status: 200 }),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const source = await readFile("sw.js", "utf8");
  const listeners = new Map();
  const fetchCalls = [];
  const cacheWrites = [];
  const storedAssets = new Map();
  let skipWaitingCalls = 0;
  const cache = {
    async addAll() {},
    async put(request, response) {
      cacheWrites.push({ request, response });
      await cachePut(request, response);
      storedAssets.set(String(request), response.clone());
    }
  };
  const caches = {
    async open() {
      return cache;
    },
    async keys() {
      return cacheNames;
    },
    async delete() {
      return true;
    },
    async match(request) {
      const url = typeof request === "string" ? request : new URL(request.url).pathname;
      if (storedAssets.has(url)) return storedAssets.get(url).clone();
      return url === "/index.html" ? shell.clone() : undefined;
    }
  };
  const fetch = (...args) => {
    fetchCalls.push(args);
    return fetchImpl?.(...args) ?? Promise.resolve(assetResponse(args[0]));
  };

  vm.runInNewContext(source, {
    self: {
      location: { origin: "https://sogrim-hesbon-app.vercel.app" },
      clients: {
        claim: async () => {},
        matchAll: async () => windowClients
      },
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
    Promise,
    AbortController,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl
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
    dispatchActivate() {
      let activatePromise;
      listeners.get("activate")({
        waitUntil(value) {
          activatePromise = Promise.resolve(value);
        }
      });
      return activatePromise;
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

function assetResponse(input, body = "fresh") {
  const pathname = new URL(
    typeof input === "string" || input instanceof URL ? String(input) : input.url
  ).pathname;
  let contentType = "application/octet-stream";
  if (pathname === "/" || pathname.endsWith(".html")) contentType = "text/html";
  else if (/\.(?:mjs|js)$/.test(pathname)) contentType = "text/javascript";
  else if (pathname.endsWith(".css")) contentType = "text/css";
  else if (pathname.endsWith(".webmanifest")) contentType = "application/manifest+json";
  else if (pathname.endsWith(".svg")) contentType = "image/svg+xml";
  else if (/\.(?:png|jpg|jpeg|webp)$/.test(pathname)) contentType = "image/png";
  else if (pathname.endsWith(".mp4")) contentType = "video/mp4";
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

test("a new service worker bypasses stale HTTP caches while rebuilding its app shell", async () => {
  const worker = await createWorker();

  await worker.dispatchInstall();

  assert.ok(worker.fetchCalls.length >= 8);
  assert.ok(worker.fetchCalls.every(([url, init]) => {
    const parsed = new URL(String(url));
    return parsed.searchParams.get("pwa_release") === "499" && init?.cache === "no-store";
  }));
  assert.ok(worker.cacheWrites.some(({ request }) => request === "/index.html"));
  assert.ok(worker.cacheWrites.some(({ request }) => request === "/src/pwaBootstrap.mjs"));
});

test("installed-app navigations bypass Safari's stale HTTP cache", async () => {
  const worker = await createWorker();
  const request = {
    url: "https://sogrim-hesbon-app.vercel.app/?pwa_release=499",
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

test("a failing origin serves the cached shell to an installed app", async () => {
  const worker = await createWorker({
    fetchImpl: async () => new Response("Service Unavailable", {
      status: 503,
      headers: { "content-type": "text/html" }
    })
  });
  const request = {
    url: "https://sogrim-hesbon-app.vercel.app/",
    method: "GET",
    mode: "navigate",
    headers: new Headers()
  };

  const response = await worker.dispatchFetch(request);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "offline shell");
});

test("a stalled network cannot leave an installed-app navigation pending", async () => {
  const worker = await createWorker({
    fetchImpl: () => new Promise(() => {}),
    setTimeoutImpl(callback) {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeoutImpl() {}
  });
  const request = {
    url: "https://sogrim-hesbon-app.vercel.app/",
    method: "GET",
    mode: "navigate",
    headers: new Headers()
  };

  const response = await worker.dispatchFetch(request);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "offline shell");
});

test("a waiting worker can be activated explicitly on iPhone", async () => {
  const worker = await createWorker();

  worker.dispatchMessage({ type: "SKIP_WAITING" });

  assert.equal(worker.skipWaitingCalls, 1);
});

test("an updated worker reloads open installed-app windows even when old page code is stuck", async () => {
  const navigations = [];
  const staleWindow = {
    url: "https://sogrim-hesbon-app.vercel.app/?qa=stale-installed-app",
    async navigate(url) {
      navigations.push(url);
    }
  };
  const worker = await createWorker({
    cacheNames: ["settle-friends-live-v442", "settle-friends-live-v499"],
    windowClients: [staleWindow]
  });

  await worker.dispatchActivate();

  assert.deepEqual(navigations, [staleWindow.url]);
});

test("a first service-worker install does not reload the open page", async () => {
  const navigations = [];
  const worker = await createWorker({
    cacheNames: ["settle-friends-live-v499"],
    windowClients: [{
      url: "https://sogrim-hesbon-app.vercel.app/",
      async navigate(url) {
        navigations.push(url);
      }
    }]
  });

  await worker.dispatchActivate();

  assert.deepEqual(navigations, []);
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
    fetchImpl: async () => new Response("latest app", {
      status: 200,
      headers: { "content-type": "text/javascript" }
    }),
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

test("optional assets do not delay replacement worker installation", async () => {
  const worker = await createWorker();

  await worker.dispatchInstall();

  assert.equal(worker.skipWaitingCalls, 1);
  assert.ok(worker.cacheWrites.some(({ request }) => request === "/index.html"));
  assert.ok(!worker.cacheWrites.some(({ request }) => request === "/support.html"));
});

test("a first installation caches the complete actual browser module graph before going offline", async () => {
  let offline = false;
  const worker = await createWorker({ fetchImpl: async input => {
    if (offline) throw new Error("offline");
    const pathname = new URL(String(input)).pathname;
    return assetResponse(input, await readFile(pathname === "/" ? "index.html" : pathname.slice(1), "utf8"));
  } });
  await worker.dispatchInstall();
  assert.equal(worker.skipWaitingCalls, 1);
  offline = true;
  const html = await readFile("index.html", "utf8");
  const pending = [...html.matchAll(/<script type="module" src="\.([^"?]+\.mjs)/g)].map(match => match[1]);
  const checked = new Set();
  while (pending.length) {
    const pathname = pending.pop();
    if (checked.has(pathname)) continue;
    checked.add(pathname);
    const expected = await readFile(pathname.slice(1), "utf8");
    const response = await worker.dispatchFetch(new Request(`https://sogrim-hesbon-app.vercel.app${pathname}`));
    assert.equal(response.status, 200, `${pathname} must work on the first offline reload`);
    assert.equal(await response.text(), expected, `${pathname} must contain the actual cached source`);
    for (const match of expected.matchAll(/(?:from\s+|import\s*\(?\s*)["'](\.[^"']+\.mjs)["']/g)) {
      pending.push(new URL(match[1], `https://sogrim-hesbon-app.vercel.app${pathname}`).pathname);
    }
  }
  assert.ok(checked.size > 100, "verify dependencies as well as top-level entry scripts");
});

test("installation limits concurrent essential downloads without omitting dependencies", async () => {
  let active = 0, peak = 0;
  const worker = await createWorker({ fetchImpl: async input => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return assetResponse(input);
  } });
  await worker.dispatchInstall();
  assert.ok(worker.cacheWrites.length > 100);
  assert.ok(peak <= 6, `expected at most six concurrent downloads, got ${peak}`);
  assert.equal(worker.skipWaitingCalls, 1);
});

for (const failure of ["response", "cache"]) {
  test(`a missing module dependency prevents activation after a ${failure} failure`, async () => {
    const path = "/src/domain/sharedStateMerge.mjs";
    const worker = await createWorker({
      fetchImpl: async input => new URL(String(input)).pathname === path && failure === "response"
        ? new Response("Unavailable", { status: 503 }) : assetResponse(input),
      cachePut: async request => { if (request === path && failure === "cache") throw new Error("quota exceeded"); }
    });
    await assert.rejects(worker.dispatchInstall(), /Precache failed|quota exceeded/);
    assert.equal(worker.skipWaitingCalls, 0);
  });
}

test("a stalled essential module download fails installation without activating an incomplete cache", async () => {
  const worker = await createWorker({
    fetchImpl: input => new URL(String(input)).pathname === "/src/domain/sharedStateMerge.mjs"
      ? new Promise(() => {}) : Promise.resolve(assetResponse(input)),
    setTimeoutImpl(callback) { queueMicrotask(callback); return 1; },
    clearTimeoutImpl() {}
  });
  await assert.rejects(worker.dispatchInstall(), /Precache failed/);
  assert.equal(worker.skipWaitingCalls, 0);
});

test("service worker never caches an HTML fallback under a JavaScript module URL", async () => {
  const worker = await createWorker({
    fetchImpl: async () => new Response("<!doctype html><title>fallback</title>", {
      status: 200,
      headers: { "content-type": "text/html" }
    })
  });

  const response = await worker.dispatchFetch(
    new Request("https://sogrim-hesbon-app.vercel.app/src/missing.mjs")
  );

  assert.equal(response.status, 200);
  assert.equal(worker.cacheWrites.length, 0);
});

test("private query and compact invites use no-store and fall back to the shell offline", async () => {
  const worker = await createWorker({
    fetchImpl: () => Promise.reject(new Error("offline"))
  });
  const privateUrls = [
    "https://sogrim-hesbon-app.vercel.app/?event=e1&key=" + "a".repeat(40),
    "https://sogrim-hesbon-app.vercel.app/i/e1/space-safe/" + "b".repeat(40),
    "https://sogrim-hesbon-app.vercel.app/?friend=0123456789abcdefabcd",
    "https://sogrim-hesbon-app.vercel.app/?ref=0123456789abcdefabcd"
  ];

  for (const url of privateUrls) {
    const response = await worker.dispatchFetch(new Request(url));
    assert.equal(await response.text(), "offline shell");
  }

  assert.equal(worker.cacheWrites.length, 0);
  assert.equal(worker.fetchCalls.length, 4);
  assert.ok(worker.fetchCalls.every(([, init]) => init?.cache === "no-store"));
});

test("a stalled private invite opens the cached shell without caching credentials", async () => {
  const worker = await createWorker({
    fetchImpl: () => new Promise(() => {}),
    setTimeoutImpl(callback) {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeoutImpl() {}
  });
  const response = await worker.dispatchFetch(
    new Request(
      "https://sogrim-hesbon-app.vercel.app/i/event-safe/t/" + "a".repeat(48)
    )
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "offline shell");
  assert.equal(worker.cacheWrites.length, 0);
  assert.equal(worker.fetchCalls[0][1]?.cache, "no-store");
});

test("a temporary origin error cannot replace a private invite with an error page", async () => {
  const worker = await createWorker({
    fetchImpl: async () => new Response("Service Unavailable", { status: 503 })
  });
  const response = await worker.dispatchFetch(
    new Request(
      "https://sogrim-hesbon-app.vercel.app/i/event-safe/t/" + "b".repeat(48)
    )
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "offline shell");
  assert.equal(worker.cacheWrites.length, 0);
});
