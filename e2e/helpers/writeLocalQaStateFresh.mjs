import { request as httpRequest } from "node:http";

export async function writeLocalQaStateFresh(baseURL, state) {
  const target = new URL("/api/state", baseURL);
  if (target.protocol !== "http:" || target.username || target.password ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("QA state write requires a local loopback server");
  }

  const payload = JSON.stringify(state);
  if (payload === undefined) throw new Error("QA state write requires JSON state");

  return new Promise((resolve, reject) => {
    const request = httpRequest(target, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload)
      },
      agent: false,
      signal: AbortSignal.timeout(30_000)
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("error", reject);
      response.once("aborted", () => reject(new Error("QA state write response aborted")));
      response.once("close", () => {
        if (!response.complete) reject(new Error("QA state write response closed before acknowledgement"));
      });
      response.once("end", () => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`QA state write failed with HTTP ${status}`));
          return;
        }
        let acknowledgement;
        try {
          acknowledgement = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          reject(new Error("QA state write returned an invalid acknowledgement"));
          return;
        }
        if (acknowledgement?.ok !== true) {
          reject(new Error("QA state write was not acknowledged"));
          return;
        }
        resolve(acknowledgement);
      });
    });
    request.once("error", reject);
    request.end(payload);
  });
}
