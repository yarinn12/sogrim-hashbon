import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { loadEnvFile } from "../src/server/envFile.mjs";
import { LEGACY_PUBLIC_ORIGIN } from "../src/domain/publicOrigin.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const baseUrl = requireStagingUrl(process.env.STAGING_BASE_URL);
const concurrency = boundedInteger(process.env.STAGING_LOAD_CONCURRENCY, 25, 1, 100);
const requestsPerTarget = boundedInteger(process.env.STAGING_LOAD_REQUESTS, 100, 1, 2_000);
const timeoutMs = boundedInteger(process.env.STAGING_LOAD_TIMEOUT_MS, 10_000, 1_000, 30_000);
const reportPath = process.env.STAGING_LOAD_REPORT ||
  join(root, "artifacts", "performance", "staging-capacity.json");

const runtimeConfig = await readJson(new URL("/api/config", `${baseUrl}/`));
assert(runtimeConfig?.storage?.mode === "supabase", "Staging is not using Supabase storage");
assert(runtimeConfig?.storage?.url, "Staging Supabase URL is missing");
assert(runtimeConfig?.storage?.anonKey, "Staging Supabase anon key is missing");
assertNotProductionSupabase(runtimeConfig.storage.url);

const targets = [
  {
    name: "staging-api-health",
    url: new URL("/api/health", `${baseUrl}/`),
    headers: {},
    validate: (payload) => payload?.ok === true
  },
  {
    name: "staging-supabase-read",
    url: new URL(
      "/rest/v1/app_snapshots?select=id&limit=0",
      `${String(runtimeConfig.storage.url).replace(/\/+$/, "")}/`
    ),
    headers: {
      apikey: runtimeConfig.storage.anonKey,
      authorization: `Bearer ${runtimeConfig.storage.anonKey}`
    },
    validate: Array.isArray
  }
];

const results = [];
for (const target of targets) {
  const result = await probeTarget(target);
  results.push(result);
  console.log(JSON.stringify(result));
}

const report = {
  generatedAt: new Date().toISOString(),
  kind: "read-only-staging-capacity-probe",
  baseUrl,
  concurrency,
  requestsPerTarget,
  writeRequestsGenerated: 0,
  results
};
await mkdir(join(root, "artifacts", "performance"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (results.some((result) => result.errorRate > 0.01 || result.latencyMs.p95 > 1_500)) {
  process.exitCode = 1;
}

async function probeTarget(target) {
  const samples = [];
  let nextIndex = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= requestsPerTarget) return;

      const startedAt = performance.now();
      try {
        const response = await request(target.url, target.headers);
        const payload = await response.json();
        samples.push({
          durationMs: performance.now() - startedAt,
          ok: response.ok && target.validate(payload),
          status: response.status
        });
      } catch (error) {
        samples.push({
          durationMs: performance.now() - startedAt,
          ok: false,
          status: 0,
          error: String(error?.name ?? "request failed")
        });
      }
    }
  }));

  const failures = samples.filter((sample) => !sample.ok);
  return {
    target: target.name,
    requests: samples.length,
    successful: samples.length - failures.length,
    failed: failures.length,
    errorRate: round(samples.length ? failures.length / samples.length : 1, 4),
    latencyMs: summarize(samples.map((sample) => sample.durationMs)),
    statusCounts: countStatuses(samples)
  };
}

async function readJson(url) {
  const response = await request(url);
  assert(response.ok, `Staging config returned HTTP ${response.status}`);
  return response.json();
}

async function request(url, headers = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "sogrim-staging-capacity-probe/1.0",
        ...headers
      }
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function requireStagingUrl(value) {
  assert(process.env.ALLOW_STAGING_LOAD_TEST === "1", "Set ALLOW_STAGING_LOAD_TEST=1 explicitly");
  assert(value, "STAGING_BASE_URL is required");
  const url = new URL(String(value).trim());
  assert(url.protocol === "https:" || isLocalHost(url.hostname), "Staging must use HTTPS");

  const blockedHosts = new Set([
    new URL(LEGACY_PUBLIC_ORIGIN).hostname,
    hostnameFrom(process.env.PRODUCTION_BASE_URL),
    hostnameFrom(process.env.APP_PUBLIC_URL)
  ].filter(Boolean));
  assert(!blockedHosts.has(url.hostname), `Refusing to probe production host ${url.hostname}`);

  const clearlyNonProduction =
    isLocalHost(url.hostname) || /(^|[.-])(staging|stage|preview|qa)([.-]|$)/i.test(url.hostname);
  assert(
    clearlyNonProduction || process.env.STAGING_CONFIRM_NON_PRODUCTION === "1",
    "Host is not clearly staging; set STAGING_CONFIRM_NON_PRODUCTION=1 after verifying it"
  );
  return url.toString().replace(/\/+$/, "");
}

function assertNotProductionSupabase(value) {
  const stagingHost = new URL(value).hostname;
  const productionHost = hostnameFrom(process.env.SUPABASE_URL);
  assert(
    !productionHost || stagingHost !== productionHost,
    "Staging points at the configured production Supabase project; refusing to continue"
  );
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: round(sorted.at(-1) ?? 0)
  };
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
}

function countStatuses(samples) {
  const counts = {};
  for (const sample of samples) {
    const key = String(sample.status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function hostnameFrom(value) {
  if (!value) return "";
  try {
    return new URL(String(value).trim()).hostname;
  } catch {
    return "";
  }
}

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
