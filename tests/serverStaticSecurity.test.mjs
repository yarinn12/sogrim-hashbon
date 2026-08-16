import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";

test("the static server exposes only client assets and never repository secrets", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const publicAsset = await fetch(`${baseUrl}/src/app.mjs`);
    assert.equal(publicAsset.status, 200);

    for (const path of [
      "/.env.local",
      "/.env",
      "/server.mjs",
      "/package.json",
      "/src/server/runtimeConfig.mjs",
      "/src",
      "/data/app-state.json"
    ]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 404, `${path} must stay private`);
    }

    const mutation = await fetch(`${baseUrl}/styles.css`, { method: "POST" });
    assert.equal(mutation.status, 405);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local state APIs reject a spoofed LAN host even from the local server", async () => {
  const handler = createAppHandler({ root: process.cwd(), port: 4173 });
  const response = responseRecorder();
  await handler({
    url: "/api/state",
    method: "GET",
    headers: { host: "192.168.1.50:4173" },
    socket: { remoteAddress: "192.168.1.20" }
  }, response);

  assert.equal(response.statusCode, 503);
});

function responseRecorder() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      Object.assign(this.headers, headers);
    },
    end() {}
  };
}
