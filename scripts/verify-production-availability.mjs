const DEFAULT_BASE_URL = "https://sogrim-hesbon-app.vercel.app";
const REQUEST_TIMEOUT_MS = 10_000;
const STRICT = process.argv.includes("--strict");
const ALLOW_ORIGIN_BACKED_SHELL = process.argv.includes(
  "--allow-origin-backed-shell"
);
const BASE_URL = normalizeBaseUrl(
  process.env.PRODUCTION_BASE_URL || DEFAULT_BASE_URL
);

const checks = [];
let runtimeConfig = null;

await checkHtml("app shell", "/", { requireAppShell: true });
await checkJson("health", "/api/health", (payload) => {
  assert(payload?.ok === true, "health did not report ok");
  assert(payload?.storageMode === "supabase", "cloud storage is not active");
  for (const field of [
    "publicUrlReady",
    "cloudStorageReady",
    "googleAuthReady",
    "accountDeletionReady",
    "shareLinksReady"
  ]) {
    assert(payload?.[field] === true, `${field} is not ready`);
  }
});
await checkJson("runtime config", "/api/config", (payload) => {
  runtimeConfig = payload;
  assert(payload?.storage?.mode === "supabase", "runtime storage is not Supabase");
  assert(/^https:\/\//.test(payload?.storage?.url ?? ""), "Supabase URL is missing");
  assert(Boolean(payload?.storage?.anonKey), "Supabase public key is missing");
});
await checkHtml("private invite shell", inviteProbePath(), {
  requireAppShell: true,
  allowPrivateNoStore: true
});
await checkHtml("privacy", "/privacy");
await checkHtml("support", "/support");
await checkHtml("terms", "/terms");
await checkAsset("brand asset", "/brand-mark.png", "image/");

if (runtimeConfig?.storage?.url && runtimeConfig?.storage?.anonKey) {
  await checkExternalJson(
    "Supabase Auth",
    `${runtimeConfig.storage.url}/auth/v1/settings`,
    { apikey: runtimeConfig.storage.anonKey }
  );
  await checkExternalJson(
    "Supabase Data API",
    `${runtimeConfig.storage.url}/rest/v1/app_snapshots?select=id&limit=0`,
    {
      apikey: runtimeConfig.storage.anonKey,
      authorization: `Bearer ${runtimeConfig.storage.anonKey}`
    }
  );
}

const failures = checks.filter((item) => item.status === "failed");
const warnings = checks.filter((item) => item.status === "warning");

for (const item of checks) {
  const marker = item.status === "passed" ? "PASS" : item.status.toUpperCase();
  console.log(`${marker.padEnd(7)} ${item.name} (${item.durationMs}ms)${item.detail ? ` - ${item.detail}` : ""}`);
}

console.log(
  `\nProduction availability: ${checks.length - failures.length - warnings.length} passed, ${warnings.length} warnings, ${failures.length} failed.`
);

if (failures.length > 0) process.exitCode = 1;

async function checkHtml(
  name,
  path,
  { requireAppShell = false, allowPrivateNoStore = false } = {}
) {
  await runCheck(name, async () => {
    const response = await request(new URL(path, `${BASE_URL}/`));
    assert(response.ok, `HTTP ${response.status}`);
    assert(
      String(response.headers.get("content-type") ?? "").includes("text/html"),
      "response is not HTML"
    );
    if (requireAppShell) {
      const body = await response.text();
      assert(/id=["']app["']/.test(body), "app shell marker is missing");
      warnOnOriginBackedShell(name, response, { allowPrivateNoStore });
    } else {
      await response.body?.cancel();
    }
  });
}

async function checkJson(name, path, validate) {
  await runCheck(name, async () => {
    const response = await request(new URL(path, `${BASE_URL}/`));
    assert(response.ok, `HTTP ${response.status}`);
    const payload = await response.json();
    validate(payload);
  });
}

async function checkExternalJson(name, url, headers) {
  await runCheck(name, async () => {
    const response = await request(url, { headers });
    assert(response.ok, `HTTP ${response.status}`);
    await response.json();
  });
}

async function checkAsset(name, path, expectedTypePrefix) {
  await runCheck(name, async () => {
    const response = await request(new URL(path, `${BASE_URL}/`));
    assert(response.ok, `HTTP ${response.status}`);
    assert(
      String(response.headers.get("content-type") ?? "").startsWith(expectedTypePrefix),
      "unexpected content type"
    );
    await response.body?.cancel();
  });
}

async function runCheck(name, operation) {
  const startedAt = Date.now();
  try {
    await operation();
    if (!checks.some((item) => item.name === name)) {
      checks.push({ name, status: "passed", durationMs: Date.now() - startedAt });
    }
  } catch (error) {
    checks.push({
      name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      detail: String(error?.message ?? error)
    });
  }
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "sogrim-production-monitor/1.0",
        ...(options.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function warnOnOriginBackedShell(name, response, { allowPrivateNoStore = false } = {}) {
  const cacheControl = String(response.headers.get("cache-control") ?? "");
  if (!cacheControl.includes("no-store")) return;
  if (allowPrivateNoStore) return;
  if (ALLOW_ORIGIN_BACKED_SHELL) return;
  const detail = "app shell is origin-backed instead of CDN-backed";
  if (STRICT) throw new Error(detail);
  const current = checks.find((item) => item.name === name);
  if (current) {
    current.status = "warning";
    current.detail = detail;
    return;
  }
  checks.push({ name, status: "warning", durationMs: 0, detail });
}

function inviteProbePath() {
  return `/i/event-availability-check/t/${"a".repeat(40)}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value).trim());
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Production base URL must use HTTPS");
  }
  return url.toString().replace(/\/+$/, "");
}
