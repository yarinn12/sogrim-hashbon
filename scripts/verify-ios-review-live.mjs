import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const publicUrl = "https://sogrim-hashbon.vercel.app";
const bundleId = "com.sogrimhashbon.app";
const supabaseUrl = String(process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const teamId = String(process.env.APPLE_TEAM_ID ?? "").trim().toUpperCase();
const checks = [];

check("Apple Team ID is configured", /^[A-Z0-9]{10}$/.test(teamId));

const settings = await fetchJson(`${supabaseUrl}/auth/v1/settings`, {
  headers: { apikey: anonKey }
});
check("Sign in with Apple is enabled in Supabase", settings.ok && settings.data?.external?.apple === true);
check("Google and email review fallbacks remain enabled", settings.data?.external?.google === true && settings.data?.external?.email === true);

const association = await fetchJson(`${publicUrl}/.well-known/apple-app-site-association`);
const associationDetails = association.data?.applinks?.details ?? [];
const expectedAppId = `${teamId}.${bundleId}`;
const expectedPaths = ["/i/*", "/r/*", "/auth/callback"];
const matchingAssociation = associationDetails.find((item) => item?.appID === expectedAppId);
check("Apple association file is publicly reachable", association.ok && association.contentType.includes("application/json"));
check(
  "Apple association file matches the app and every deep-link route",
  Boolean(matchingAssociation) && expectedPaths.every((path) => matchingAssociation.paths?.includes(path))
);

for (const [name, path, expectedText] of [
  ["Privacy page", "/privacy", "Apple"],
  ["Support page", "/support", "Apple"],
  ["Accessibility page", "/accessibility", "הצהרת נגישות"],
  ["Account deletion page", "/account-deletion", "\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df"]
]) {
  const page = await fetchText(`${publicUrl}${path}`);
  check(`${name} is live and current`, page.ok && page.text.includes(expectedText));
}

const credentialsPath = ".store-review-credentials.json";
let reviewAccountReady = false;
if (existsSync(credentialsPath) && supabaseUrl && anonKey) {
  try {
    const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
    const session = await signInWithPassword(
      { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
      { email: credentials.email, password: credentials.password }
    );
    reviewAccountReady = Boolean(session?.user?.id && session.user.id === credentials.userId);
  } catch {}
}
check("Private App Review account signs in successfully", reviewAccountReady);

const ready = checks.every((item) => item.ok);
console.log(JSON.stringify({ ready, checks }, null, 2));
if (!ready) process.exitCode = 1;

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

async function fetchJson(url, options = {}) {
  if (!url || url.startsWith("/")) return { ok: false, data: null, contentType: "" };
  try {
    const response = await fetch(url, options);
    return {
      ok: response.ok,
      data: await response.json().catch(() => null),
      contentType: response.headers.get("content-type") ?? ""
    };
  } catch {
    return { ok: false, data: null, contentType: "" };
  }
}

async function fetchText(url) {
  try {
    const response = await fetch(url);
    return { ok: response.ok, text: await response.text() };
  } catch {
    return { ok: false, text: "" };
  }
}
