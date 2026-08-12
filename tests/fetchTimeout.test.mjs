import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithTimeout } from "../src/data/fetchTimeout.mjs";

test("network requests abort and reject when the server never responds", async () => {
  let signal = null;
  await assert.rejects(
    fetchWithTimeout(
      async (_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
      "https://example.com/hanging",
      {},
      5
    ),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(signal.aborted, true);
});

test("successful requests clear the timeout without changing the response", async () => {
  const response = { ok: true };
  const result = await fetchWithTimeout(
    async (_url, options) => {
      assert.equal(options.signal.aborted, false);
      return response;
    },
    "https://example.com/ready",
    {},
    50
  );

  assert.equal(result, response);
});

test("an upstream abort is forwarded to the request", async () => {
  const upstream = new AbortController();
  let requestSignal = null;
  const request = fetchWithTimeout(
    async (_url, options) => {
      requestSignal = options.signal;
      return new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason));
      });
    },
    "https://example.com/cancelled",
    { signal: upstream.signal },
    100
  );

  await Promise.resolve();
  await Promise.resolve();
  upstream.abort(new Error("cancelled"));
  await assert.rejects(request, /cancelled/);
  assert.equal(requestSignal.aborted, true);
});
