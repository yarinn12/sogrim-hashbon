export async function readLocalQaState(request, baseURL) {
  const target = new URL("/api/state", baseURL);
  if (target.protocol !== "http:" || target.username || target.password ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("QA state read requires a local loopback server");
  }
  // This synthetic, read-only QA request can be repeated once after a local
  // connection reset. Playwright retries ECONNRESET only.
  const response = await request.get(target.href, { maxRetries: 1, maxRedirects: 0 });
  if (!response.ok()) {
    throw new Error(`QA state read failed with HTTP ${response.status()}`);
  }
  return response;
}
