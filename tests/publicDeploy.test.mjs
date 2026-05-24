import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";
import { getRuntimeConfig } from "../src/server/runtimeConfig.mjs";

test("runtime config can infer a public URL from the deployment request origin", () => {
  const config = getRuntimeConfig(
    {
      SUPABASE_URL: "https://demo.supabase.co",
      SUPABASE_ANON_KEY: "anon-key"
    },
    "https://settle-friends.vercel.app"
  );

  assert.equal(config.publicUrl, "https://settle-friends.vercel.app");
  assert.equal(config.launch.publicUrlReady, true);
  assert.equal(config.launch.shareLinksReady, true);
});

test("runtime config still prefers an explicit APP_PUBLIC_URL", () => {
  const config = getRuntimeConfig(
    { APP_PUBLIC_URL: "https://settle.example.com" },
    "https://preview.vercel.app"
  );

  assert.equal(config.publicUrl, "https://settle.example.com");
});

test("local 127.0.0.1 requests keep http invite origins", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/config`);
    const config = await response.json();

    assert.equal(config.publicUrl, `http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("server can run as both a local server and a Vercel handler", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /export function createAppHandler/);
  assert.match(server, /export default createAppHandler\(\)/);
  assert.match(server, /requestOrigin\(request, port\)/);
  assert.match(server, /isDirectRun\(\)/);
});

test("Vercel config routes the public app through the Node handler", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  assert.deepEqual(config.builds, [
    {
      src: "server.mjs",
      use: "@vercel/node",
      config: {
        includeFiles: [
          "index.html",
          "styles.css",
          "manifest.webmanifest",
          "icon.svg",
          "sw.js",
          "src/**"
        ]
      }
    }
  ]);
  assert.deepEqual(config.routes, [{ src: "/(.*)", dest: "/server.mjs" }]);
});
