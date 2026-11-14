import { request as httpRequest } from "node:http";

export async function resetLocalQaStateFresh(baseURL) {
  const target = new URL("/api/reset", baseURL);
  if (target.protocol !== "http:" || target.username || target.password ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("QA reset requires a local loopback server");
  }

  return new Promise((resolve, reject) => {
    const request = httpRequest(target, {
      method: "POST",
      // Keep this synthetic reset off Playwright's shared keep-alive socket pool.
      agent: false,
      signal: AbortSignal.timeout(30_000)
    }, response => {
      response.once("error", reject);
      response.once("aborted", () => reject(new Error("QA reset response aborted")));
      response.once("end", () => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) reject(new Error(`QA reset failed with HTTP ${status}`));
        else resolve();
      });
      response.resume();
    });
    request.once("error", reject);
    request.end();
  });
}
