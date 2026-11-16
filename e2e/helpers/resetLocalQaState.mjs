export async function resetLocalQaState(request, baseURL) {
  const target = new URL("/api/reset", baseURL);
  if (target.protocol !== "http:" || target.username || target.password ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("QA reset requires a local loopback server");
  }
  // Reset is idempotent and contains only synthetic fixture state. Playwright
  // retries ECONNRESET only; HTTP failures and repeated disconnects still fail.
  const response = await request.post(target.href, { maxRetries: 1, maxRedirects: 0 });
  if (!response.ok()) {
    throw new Error(`QA reset failed with HTTP ${response.status()}`);
  }
  return response;
}
