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

test("runtime config scopes ad switches to the eligible Android build", async () => {
  const previous = {
    ADMOB_ENABLED: process.env.ADMOB_ENABLED,
    ADMOB_ANDROID_BANNER_ID: process.env.ADMOB_ANDROID_BANNER_ID,
    ADMOB_TEST_MODE: process.env.ADMOB_TEST_MODE,
    ADMOB_ROLLOUT_PERCENT: process.env.ADMOB_ROLLOUT_PERCENT,
    ADMOB_MIN_ANDROID_BUILD: process.env.ADMOB_MIN_ANDROID_BUILD
  };
  Object.assign(process.env, {
    ADMOB_ENABLED: "true",
    ADMOB_ANDROID_BANNER_ID: "ca-app-pub-demo/banner",
    ADMOB_TEST_MODE: "true",
    ADMOB_ROLLOUT_PERCENT: "5",
    ADMOB_MIN_ANDROID_BUILD: "28"
  });
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const endpoint = `http://127.0.0.1:${port}/api/config`;
    const [browserConfig, oldAndroidConfig, currentAndroidConfig] =
      await Promise.all([
        fetch(endpoint).then((response) => response.json()),
        fetch(endpoint, {
          headers: {
            "X-Sogrim-Platform": "android",
            "X-Sogrim-App-Build": "27"
          }
        }).then((response) => response.json()),
        fetch(endpoint, {
          headers: {
            "X-Sogrim-Platform": "android",
            "X-Sogrim-App-Build": "28",
            "X-Sogrim-App-Version": "3.5"
          }
        }).then((response) => response.json())
      ]);

    assert.equal(browserConfig.monetization.adsEnabled, false);
    assert.equal(browserConfig.monetization.testMode, false);
    assert.equal(oldAndroidConfig.monetization.adsEnabled, false);
    assert.equal(oldAndroidConfig.monetization.testMode, false);
    assert.equal(currentAndroidConfig.monetization.adsEnabled, true);
    assert.equal(currentAndroidConfig.monetization.testMode, true);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("native preflight allows app-version rollout headers", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://localhost",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers":
          "x-sogrim-platform, x-sogrim-app-build, x-sogrim-app-version"
      }
    });
    const allowedHeaders =
      response.headers.get("access-control-allow-headers") ?? "";

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://localhost");
    assert.match(allowedHeaders, /x-sogrim-platform/);
    assert.match(allowedHeaders, /x-sogrim-app-build/);
    assert.match(allowedHeaders, /x-sogrim-app-version/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("server bypasses browser cache for the app shell and browser modules", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const [home, worker, moduleFile, stylesheet] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/`),
      fetch(`http://127.0.0.1:${port}/sw.js`),
      fetch(`http://127.0.0.1:${port}/src/publicProductV1Layer.mjs`),
      fetch(`http://127.0.0.1:${port}/styles.css`)
    ]);

    for (const response of [home, worker, moduleFile, stylesheet]) {
      assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    }

    const video = await fetch(
      `http://127.0.0.1:${port}/assets/sogrim-logo-intro.mp4`,
      { method: "HEAD" }
    );
    assert.equal(video.status, 200);
    assert.equal(
      video.headers.get("cache-control"),
      "public, max-age=86400, stale-while-revalidate=604800"
    );
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

test("Vercel serves static assets from the CDN and reserves Node for dynamic routes", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  const nodeBuild = config.builds.find((entry) => entry.src === "server.mjs");
  assert.deepEqual(nodeBuild, {
    src: "server.mjs",
    use: "@vercel/node"
  });
  for (const source of ["*.html", "*.css", "*.png", "*.txt", "assets/**", "src/data/**", "src/domain/**"]) {
    assert.ok(config.builds.some((entry) => entry.src === source && entry.use === "@vercel/static"));
  }
  assert.ok(config.routes.some((route) => route.src === "/api/(.*)" && route.dest === "/server.mjs"));
  assert.ok(config.routes.some((route) => (
    route.src === "/assets/(.*)" &&
    route.continue === true &&
    route.headers?.["Cache-Control"] ===
      "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800"
  )));
  assert.ok(config.routes.some((route) => route.src === "/i/(.*)" && route.dest === "/index.html"));
  assert.ok(config.routes.some((route) => route.src === "/r/(.*)" && route.dest === "/index.html"));
  assert.ok(config.routes.some((route) => route.handle === "filesystem"));
  assert.ok(config.routes.some((route) => route.src === "/(.*)" && route.dest === "/index.html"));
  assert.equal(config.routes[0].continue, true);
  assert.match(config.routes[0].headers?.["Content-Security-Policy"] ?? "", /default-src 'self'/);
});

test("deployed app shell uses the CDN without caching private invite pages", async () => {
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    cdnCacheAppShell: true
  }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const [home, privateInvite, authCallback] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/`),
      fetch(`http://127.0.0.1:${port}/i/event-cache-check/t/${"a".repeat(40)}`),
      fetch(`http://127.0.0.1:${port}/auth/callback?code=private-code`)
    ]);

    assert.equal(
      home.headers.get("cache-control"),
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    assert.equal(
      privateInvite.headers.get("cache-control"),
      "no-store, max-age=0"
    );
    assert.equal(
      authCallback.headers.get("cache-control"),
      "no-store, max-age=0"
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("AdMob ownership file is public, plain text and uses the app publisher ID", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/app-ads.txt`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
    assert.equal(
      body.trim(),
      "google.com, pub-8171715888836308, DIRECT, f08c47fec0942fa0"
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("deployment includes only the required public PNG assets", async () => {
  const vercelIgnore = await readFile(".vercelignore", "utf8");

  assert.match(vercelIgnore, /^\*\.png$/m);
  assert.match(vercelIgnore, /^!brand-mark\.png$/m);
  assert.match(vercelIgnore, /^!brand-mark-v3\.png$/m);
  assert.match(vercelIgnore, /^!icon-192\.png$/m);
  assert.match(vercelIgnore, /^!icon-512\.png$/m);
  assert.match(vercelIgnore, /^!icon-maskable-512\.png$/m);
  assert.match(vercelIgnore, /^!apple-touch-icon\.png$/m);
  assert.match(vercelIgnore, /^!sogrim-logo-lockup\.png$/m);
  assert.match(vercelIgnore, /^!sogrim-share-logo\.png$/m);
  assert.match(vercelIgnore, /^!sogrim-home-hero\.png$/m);
  assert.match(vercelIgnore, /^!assets\/sign-in-with-apple-iw\.png$/m);
  assert.match(vercelIgnore, /^\/downloads\/\*$/m);
  assert.match(
    vercelIgnore,
    /^!\/downloads\/sogrim-hashbon-android-1\.2\.apk$/m
  );
});
