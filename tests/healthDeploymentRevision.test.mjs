import test from "node:test";
import assert from "node:assert/strict";
import { getHealthPayload } from "../src/server/health.mjs";
import { createServer } from "node:http";
import { createAppHandler } from "../server.mjs";

test("health exposes only a validated deployment commit for live verification", () => {
  const deploymentRevision = "1234567890abcdef1234567890abcdef12345678";
  assert.equal(getHealthPayload({}, { deploymentRevision }).deploymentRevision, deploymentRevision);
  for (const invalid of [undefined, "", "some private environment value", "a".repeat(41)]) {
    assert.equal(Object.hasOwn(getHealthPayload({}, { deploymentRevision: invalid }), "deploymentRevision"), false);
  }
});

test("HTTP health reports the Render or Vercel source without exposing invalid environment values", async () => {
  const vercelCommit = "b".repeat(40);
  const renderCommit = "a".repeat(40);
  const cases = [
    [{ RENDER: "true", RENDER_GIT_COMMIT: renderCommit }, renderCommit],
    [{ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: vercelCommit }, vercelCommit],
    [{ VERCEL_GIT_COMMIT_SHA: vercelCommit, RENDER_GIT_COMMIT: renderCommit }, vercelCommit],
    [{ RENDER: "true", RENDER_GIT_COMMIT: "private configuration, never a revision" }, undefined],
    [{ RENDER_GIT_COMMIT: "a".repeat(41) }, undefined],
    [{}, undefined]
  ];
  for (const [provider, expected] of cases) {
    const server = createServer(createAppHandler({
      root: process.cwd(), port: 0,
      env: { NODE_ENV: "production", APP_PUBLIC_URL: "https://sogrim-hesbon-app.vercel.app", ...provider },
      serverRequestLogger: null
    }));
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, {
        headers: { host: "sogrim-hesbon-app.vercel.app", "x-forwarded-proto": "https" }
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.deploymentRevision, expected,
        "the HTTP route must carry the provider commit to the validated public payload");
      assert.equal(Object.hasOwn(payload, "deploymentRevision"), expected !== undefined);
      assert.equal(JSON.stringify(payload).includes("private configuration"), false);
    } finally {
      await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    }
  }
});
