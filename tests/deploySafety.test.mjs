import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function responseHeadersBeforeFilesystem(config, pathname) {
  const headers = {};
  for (const route of config.routes) {
    if (route.handle === "filesystem") break;
    if (!route.src || !new RegExp(route.src).test(pathname)) continue;
    for (const [name, value] of Object.entries(route.headers ?? {})) {
      headers[name.toLowerCase()] = value;
    }
    if (route.dest && !route.continue) break;
  }
  return headers;
}

test("Vercel serves the extensionless Apple association as JSON before static fallback", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const headers = responseHeadersBeforeFilesystem(config, "/.well-known/apple-app-site-association");
  assert.match(headers["content-type"] ?? "", /^application\/json(?:;|$)/,
    "Apple must receive JSON instead of the static host's application/octet-stream default");
  assert.equal(headers["x-content-type-options"], "nosniff");
});

test("Apple association MIME override does not alter other assets or similarly named paths", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  for (const pathname of ["/", "/src/app.mjs", "/.well-known/assetlinks.json",
    "/xwell-known/apple-app-site-association", "/.well-known/apple-app-site-association-extra",
    "/.well-known/apple-app-site-association/child"]) {
    assert.equal(responseHeadersBeforeFilesystem(config, pathname)["content-type"], undefined, pathname);
  }
});

test("deployment ignores local secrets and local state files", async () => {
  const [gitignore, vercelignore] = await Promise.all([
    readFile(".gitignore", "utf8"),
    readFile(".vercelignore", "utf8")
  ]);

  assert.match(gitignore, /\.env/);
  assert.match(gitignore, /\.vercel\//);
  assert.match(gitignore, /data\/app-state\.json/);
  assert.match(gitignore, /docs\/superpowers\//);
  assert.match(gitignore, /publish\//);
  assert.match(gitignore, /upload-\*\//);
  assert.match(gitignore, /deploy-\*\//);
  assert.match(gitignore, /\.qa-\*\//);
  assert.match(gitignore, /\.ux-\*\//);
  assert.match(gitignore, /\*\.zip/);
  assert.match(gitignore, /audit\/backups\//);
  assert.match(gitignore, /work\/\*backup\*\.json/);
  assert.match(vercelignore, /\.qa-\*/);
  assert.match(vercelignore, /\.ux-\*/);
  assert.match(vercelignore, /^tests$/m);
  assert.match(vercelignore, /^artifacts$/m);
  assert.match(vercelignore, /^audit$/m);
  assert.match(vercelignore, /^work$/m);
  assert.match(vercelignore, /^\.codex$/m);
});
