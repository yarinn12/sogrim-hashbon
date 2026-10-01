import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PUBLIC_ORIGIN } from "../src/domain/publicOrigin.mjs";

const DEFAULT_SERVICES_ID = "com.sogrimhashbon.app.web";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// This preflight checks public provider configuration and the initial redirect.
// It does not follow Apple's redirect, authenticate a user, or exchange a token.
export async function verifyIosLoginProviders({
  publicOrigin = PUBLIC_ORIGIN,
  servicesId = DEFAULT_SERVICES_ID,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const checks = [];
  const check = (name, ok) => {
    checks.push({ name, ok: Boolean(ok) });
    return Boolean(ok);
  };
  const report = () => ({
    ready: checks.every(item => item.ok),
    scope: "Public provider configuration and initial authorization redirect only; no user sign-in performed.",
    checks
  });
  const origin = httpsOrigin(publicOrigin);
  const deadlineMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.min(timeoutMs, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  if (!check("Public app origin is a valid HTTPS origin", origin)) return report();

  const config = await request(`${origin}/api/config`, {}, response => (
    response.ok ? response.json() : null
  ));
  if (!check("Public runtime configuration is reachable", config && typeof config === "object")) return report();
  const backend = httpsOrigin(config.storage?.url);
  const publicKey = typeof config.storage?.anonKey === "string" ? config.storage.anonKey.trim() : "";
  if (!check("Public runtime configuration supplies an HTTPS Supabase backend", config.storage?.mode === "supabase" && backend && publicKey)) return report();

  const headers = { apikey: publicKey };
  const settings = await request(`${backend}/auth/v1/settings`, headers, response => (
    response.ok ? response.json() : null
  ));
  if (!check("Supabase settings advertise Sign in with Apple", settings?.external?.apple === true)) return report();

  const authorizeUrl = new URL(`${backend}/auth/v1/authorize`);
  authorizeUrl.searchParams.set("provider", "apple");
  authorizeUrl.searchParams.set("redirect_to", `${origin}/auth/callback`);
  // Do not supply scopes: verify the same provider defaults used by the app.
  const redirect = await request(authorizeUrl, headers, response => ({
    status: response.status,
    location: response.headers.get("location")
  }));
  if (!check("Apple authorization endpoint returns a redirect", REDIRECT_STATUSES.has(redirect?.status))) return report();
  let appleUrl;
  try {
    appleUrl = new URL(redirect.location);
  } catch {}
  if (!check("Authorization redirects directly to Apple's HTTPS sign-in endpoint", appleUrl?.origin === "https://appleid.apple.com" && appleUrl.pathname === "/auth/authorize" && !appleUrl.username && !appleUrl.password && !appleUrl.hash)) return report();
  check("Apple authorization uses the expected Services ID", appleUrl.searchParams.get("client_id") === servicesId);
  const scopes = new Set((appleUrl.searchParams.get("scope") || "").trim().split(/\s+/u).filter(Boolean));
  check("Apple authorization requests only name and email", scopes.size === 2 && scopes.has("name") && scopes.has("email"));
  check("Apple authorization returns to this Supabase backend", appleUrl.searchParams.get("redirect_uri") === `${backend}/auth/v1/callback`);
  return report();

  async function request(url, headers, readResponse) {
    const controller = new AbortController();
    let timeout;
    try {
      // The race bounds both network and body reads, even if a supplied fetch
      // implementation ignores AbortSignal. Never surface URLs or error bodies.
      return await Promise.race([
        Promise.resolve().then(async () => readResponse(await fetchImpl(url, {
          method: "GET",
          headers: { accept: "application/json", ...headers },
          credentials: "omit",
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal
        }))).catch(() => null),
        new Promise(resolveTimeout => {
          timeout = setTimeout(() => {
            controller.abort();
            resolveTimeout(null);
          }, deadlineMs);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function httpsOrigin(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash ? url.origin : "";
  } catch {
    return "";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await verifyIosLoginProviders({
    publicOrigin: process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_ORIGIN || PUBLIC_ORIGIN,
    servicesId: process.env.APPLE_SERVICES_ID || DEFAULT_SERVICES_ID
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
