import { expect } from "@playwright/test";
import { isWebKitReloadDiagnostic } from "./reloadDiagnostics.mjs";

// WebKit can cancel an old document's inbox read while an explicit reload
// replaces that document. Keep the raw failure until the new document has
// completed the exact same read. Every other request failure remains an error.
export function recordPersonalPinsCloudErrors(page, { origin, userId, browserName }) {
  const errors = [], diagnostics = [];
  const activeRequests = new Map(), inboxRequests = [], failedUrls = new Set();
  let reload = null, generation = 0, sequence = 0;
  const next = () => ++sequence;
  const inboxUrl = value => {
    try {
      const url = new URL(value);
      return url.origin === origin && url.pathname === "/rest/v1/notification_inbox" &&
        url.searchParams.get("recipient_user_id") === "eq." + userId ? url.href : null;
    } catch { return null; }
  };
  const snapshotWriteUrl = (value, method) => {
    if (method === "GET") return null;
    try {
      const url = new URL(value);
      return url.origin === origin && url.pathname === "/rest/v1/app_snapshots" ? url.href : null;
    } catch { return null; }
  };
  const exactInboxRead = value => {
    const href = inboxUrl(value);
    if (!href) return false;
    const query = new URL(href).searchParams;
    return [...query.keys()].length === 4 &&
      query.get("recipient_user_id") === "eq." + userId &&
      query.get("select") === "id,event_id,activity_id,kind,title,body,view,action_url,created_at,read_at" &&
      query.get("order") === "created_at.desc" && query.get("limit") === "40";
  };
  page.on("request", request => {
    const eventSequence = next();
    if (reload && request.isNavigationRequest?.()) {
      try {
        if (request.frame() === page.mainFrame()) reload.navigationStart ||= eventSequence;
      } catch { /* An early navigation request can precede frame attachment. */ }
    }
    const method = request.method?.() ?? "GET";
    const isInbox = Boolean(inboxUrl(request.url()));
    const url = inboxUrl(request.url()) || snapshotWriteUrl(request.url(), method);
    if (!url) return;
    const entry = { request, url, method, isInbox, generation, sequence: eventSequence };
    activeRequests.set(request, entry);
    if (isInbox) {
      inboxRequests.push(entry);
      reload?.issuedUrls.add(url);
    }
  });
  page.on("response", response => {
    const entry = activeRequests.get(response.request());
    if (!entry) return;
    entry.status = response.status();
    entry.allowOrigin = response.headers()["access-control-allow-origin"] ?? null;
    entry.responseSequence = next();
  });
  page.on("requestfinished", request => {
    const entry = activeRequests.get(request);
    if (!entry) return;
    entry.finished = next();
    activeRequests.delete(request);
  });
  page.on("requestfailed", request => {
    const entry = activeRequests.get(request);
    const url = entry?.url || inboxUrl(request.url()) ||
      snapshotWriteUrl(request.url(), request.method?.() ?? "GET");
    if (!url) return;
    const failureText = request.failure?.()?.errorText || "unknown";
    const raw = "requestfailed: " + url + ": " + failureText;
    const errorIndex = errors.length;
    errors.push(raw);
    failedUrls.add(url);
    if (entry) {
      entry.failure = { text: failureText, raw, errorIndex, sequence: next() };
      activeRequests.delete(request);
      reload?.failures.push(entry);
    }
  });
  page.on("framenavigated", frame => {
    if (frame !== page.mainFrame?.()) return;
    generation += 1;
    if (reload?.navigationStart) reload.navigationCommit ||= next();
  });
  page.on("pageerror", error => {
    const firstLine = String(error.stack ?? "").split("\n")[0];
    const prefix = "Fetch API cannot load ", suffix = " due to access control checks.";
    const url = firstLine.startsWith(prefix) && firstLine.endsWith(suffix)
      ? inboxUrl(firstLine.slice(prefix.length, -suffix.length)) : null;
    if (reload && url && isWebKitReloadDiagnostic(error, { browserName, reloading: true, origin }) &&
      String(error.stack).includes("/src/data/fetchTimeout.mjs:") &&
      !reload.issuedUrls.has(url) && !failedUrls.has(url)) {
      diagnostics.push({ url, stack: error.stack, reason: "webkit-document-replacement" });
    } else errors.push(error.message);
  });
  const withReload = async (callback, { ready, acknowledgementTimeoutMs = 8_000 } = {}) => {
    if (reload) throw new Error("Nested document reload in personal pins fixture");
    const oldDocument = typeof page.evaluate === "function"
      ? await page.evaluate(() => performance.timeOrigin) : null;
    const boundary = { issuedUrls: new Set([...activeRequests.values()].map(item => item.url)),
      activeAtStart: new Set(activeRequests.keys()), failures: [],
      oldGeneration: generation, oldDocument, boundaryStart: next(),
      navigationStart: null, navigationCommit: null };
    reload = boundary;
    try {
      const result = await callback();
      const candidates = boundary.failures.filter(entry =>
        browserName === "webkit" && entry.method === "GET" &&
        exactInboxRead(entry.url) && entry.failure?.text === "Load request cancelled" &&
        entry.status == null && entry.generation === boundary.oldGeneration &&
        (entry.sequence > boundary.boundaryStart || boundary.activeAtStart.has(entry.request)) &&
        entry.failure.sequence > boundary.boundaryStart &&
        boundary.navigationStart > boundary.boundaryStart &&
        boundary.navigationCommit > boundary.navigationStart);
      if (!candidates.length || oldDocument == null || typeof ready !== "function") return result;
      await ready();
      const newDocument = await page.evaluate(() => performance.timeOrigin);
      if (newDocument == null || newDocument === oldDocument || generation <= boundary.oldGeneration)
        throw new Error("Cancelled old-document inbox read has no verified replacement document");
      const findAck = failed => inboxRequests.find(entry =>
        entry.url === failed.url && entry.method === "GET" && entry.generation === generation &&
        entry.sequence > boundary.navigationCommit &&
        entry.sequence > failed.failure.sequence &&
        entry.status >= 200 && entry.status < 300 &&
        [origin, "*"].includes(entry.allowOrigin) && entry.finished && !entry.failure);
      const proven = [];
      for (const entry of candidates) {
        await expect.poll(() => Boolean(findAck(entry)),
          { timeout: acknowledgementTimeoutMs }).toBe(true);
        const ack = findAck(entry);
        if (errors[entry.failure.errorIndex] !== entry.failure.raw)
          throw new Error("Cancelled inbox failure changed before classification");
        proven.push({ url: entry.url, method: entry.method, raw: entry.failure.raw,
          oldDocument, newDocument, requestSequence: entry.sequence,
          failureSequence: entry.failure.sequence,
          navigationStart: boundary.navigationStart,
          navigationCommit: boundary.navigationCommit,
          acknowledgementSequence: ack.finished,
          reason: "webkit-old-document-inbox-read-cancelled" });
      }
      diagnostics.push(...proven);
      for (const entry of candidates.sort((a, b) => b.failure.errorIndex - a.failure.errorIndex))
        errors.splice(entry.failure.errorIndex, 1);
      return result;
    } finally { reload = null; }
  };
  return { errors, diagnostics, withReload };
}
