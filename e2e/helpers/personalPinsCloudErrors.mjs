import { isWebKitReloadDiagnostic } from "./reloadDiagnostics.mjs";

// The account fixture deliberately replaces its document while inbox reads
// run in the background. Keep WebKit's unissued old-document diagnostic for
// inspection, while an issued or failed request still fails the test.
export function recordPersonalPinsCloudErrors(page, { origin, userId, browserName }) {
  const errors = [], diagnostics = [];
  const activeRequests = new Map(), failedUrls = new Set();
  let reload = null;
  const inboxUrl = value => {
    try {
      const url = new URL(value);
      return url.origin === origin && url.pathname === "/rest/v1/notification_inbox" &&
        url.searchParams.get("recipient_user_id") === `eq.${userId}` ? url.href : null;
    } catch { return null; }
  };
  page.on("request", request => {
    const url = inboxUrl(request.url());
    if (!url) return;
    activeRequests.set(request, url);
    reload?.issuedUrls.add(url);
  });
  page.on("requestfinished", request => activeRequests.delete(request));
  page.on("requestfailed", request => {
    const url = activeRequests.get(request) || inboxUrl(request.url());
    activeRequests.delete(request);
    if (!url) return;
    failedUrls.add(url);
    errors.push(`requestfailed: ${url}: ${request.failure?.()?.errorText || "unknown"}`);
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
  const withReload = async callback => {
    if (reload) throw new Error("Nested document reload in personal pins fixture");
    reload = { issuedUrls: new Set(activeRequests.values()) };
    try { return await callback(); }
    finally { reload = null; }
  };
  return { errors, diagnostics, withReload };
}
