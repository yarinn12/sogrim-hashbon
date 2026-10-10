import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

test.use({ serviceWorkers: "allow" });

test("installed app serves local Hebrew and numeric fonts after origin loss", async ({ page }) => {
  const root = process.cwd();
  const types = {
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
    ".mjs": "text/javascript", ".woff2": "font/woff2", ".png": "image/png",
    ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp4": "video/mp4",
    ".webmanifest": "application/manifest+json", ".txt": "text/plain"
  };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname.startsWith("/api/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }
    const filePath = join(root, pathname === "/" ? "index.html" : pathname.slice(1));
    const relativePath = relative(root, filePath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let closed = false;
  const closeOrigin = async () => {
    if (closed) return;
    closed = true;
    const done = new Promise(resolve => server.close(resolve));
    server.closeAllConnections?.();
    await done;
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      message: "the installed app shell should be controlled by its worker"
    }).toBe(true);

    const fontPaths = [
      "/assets/fonts/rubik-hebrew-v31.woff2",
      "/assets/fonts/inter-latin-v20.woff2"
    ];
    const cached = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      const response = await caches.match(path);
      return { path, ok: response?.ok, contentType: response?.headers.get("content-type") };
    })), fontPaths);
    for (const font of cached) {
      expect(font.ok, `${font.path} must be stored before the worker takes control`).toBe(true);
      expect(font.contentType).toContain("font/woff2");
    }

    // Playwright's WebKit setOffline(true) currently rejects even literal SW
    // responses (microsoft/playwright#42775). Closing the origin exercises
    // the real cache fallback in both engines without that emulation bug.
    await closeOrigin();
    const offlineFonts = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      const response = await fetch(path);
      return { path, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
    })), fontPaths);
    for (const font of offlineFonts) {
      expect(font.ok, `${font.path} must remain fetchable after origin loss`).toBe(true);
      expect(font.bytes).toBeGreaterThan(1_000);
    }
  } finally {
    await closeOrigin();
  }
});
