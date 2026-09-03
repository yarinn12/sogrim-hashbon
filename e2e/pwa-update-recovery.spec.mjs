import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const OLD_RELEASE = "443";
const CURRENT_RELEASE = "445";

test("a new worker reloads an installed app even when the old page suppresses controllerchange", async ({
  page
}) => {
  const currentWorker = await readFile("sw.js", "utf8");
  let serveCurrentRelease = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Cache-Control", "no-store, max-age=0");

    if (url.pathname === "/sw.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(serveCurrentRelease ? currentWorker : oldWorkerSource());
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(installedAppPage(serveCurrentRelease ? CURRENT_RELEASE : OLD_RELEASE));
      return;
    }

    response.setHeader("Content-Type", contentType(url.pathname));
    response.end(url.pathname.endsWith(".mjs") || url.pathname.endsWith(".js") ? "export {};" : "asset");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => Boolean(window.__pwaReady))).toBe(true);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-pwa-release", OLD_RELEASE);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("settle-friends-pwa-update-reload"))).toBe(OLD_RELEASE);

    serveCurrentRelease = true;
    await page.evaluate(() => window.__pwaRegistration.update());

    await expect(page.locator("html")).toHaveAttribute(
      "data-pwa-release",
      CURRENT_RELEASE,
      { timeout: 20_000 }
    );
  } finally {
    await page.goto("about:blank").catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

function oldWorkerSource() {
  return `
const CACHE_NAME = "settle-friends-live-v${OLD_RELEASE}";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") event.respondWith(fetch(event.request));
});
`;
}

function installedAppPage(release) {
  return `<!doctype html>
<html data-pwa-release="${release}">
  <head><meta charset="utf-8"><title>PWA update recovery</title></head>
  <body>
    <script>
      const RELEASE = "${release}";
      const UPDATE_KEY = "settle-friends-pwa-update-reload";
      sessionStorage.setItem(UPDATE_KEY, RELEASE);
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (sessionStorage.getItem(UPDATE_KEY) === RELEASE) return;
          location.reload();
        });
      }
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      }).then(async (registration) => {
        window.__pwaRegistration = registration;
        await navigator.serviceWorker.ready;
        window.__pwaReady = true;
      });
    </script>
  </body>
</html>`;
}

function contentType(pathname) {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".mjs") || pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (pathname.endsWith(".webmanifest")) return "application/manifest+json";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (/\.(?:png|jpg|jpeg|webp)$/.test(pathname)) return "image/png";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  return "text/plain; charset=utf-8";
}
