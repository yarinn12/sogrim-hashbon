import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";

const videoPath = "assets/sogrim-logo-intro.mp4";

test("the intro video supports the byte ranges required by iPhone Safari", async () => {
  const fileStats = await stat(videoPath);
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/${videoPath}`;

    const partialResponse = await fetch(url, {
      headers: { range: "bytes=0-99" }
    });
    assert.equal(partialResponse.status, 206);
    assert.equal(partialResponse.headers.get("content-type"), "video/mp4");
    assert.equal(partialResponse.headers.get("accept-ranges"), "bytes");
    assert.equal(
      partialResponse.headers.get("content-range"),
      `bytes 0-99/${fileStats.size}`
    );
    assert.equal(partialResponse.headers.get("content-length"), "100");
    assert.equal((await partialResponse.arrayBuffer()).byteLength, 100);

    const suffixResponse = await fetch(url, {
      headers: { range: "bytes=-64" }
    });
    assert.equal(suffixResponse.status, 206);
    assert.equal(
      suffixResponse.headers.get("content-range"),
      `bytes ${fileStats.size - 64}-${fileStats.size - 1}/${fileStats.size}`
    );
    assert.equal((await suffixResponse.arrayBuffer()).byteLength, 64);

    const invalidResponse = await fetch(url, {
      headers: { range: `bytes=${fileStats.size}-` }
    });
    assert.equal(invalidResponse.status, 416);
    assert.equal(
      invalidResponse.headers.get("content-range"),
      `bytes */${fileStats.size}`
    );

    const headResponse = await fetch(url, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("accept-ranges"), "bytes");
    assert.equal(headResponse.headers.get("content-length"), String(fileStats.size));
    assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
