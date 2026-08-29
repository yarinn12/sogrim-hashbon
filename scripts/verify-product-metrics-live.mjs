import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const publicOrigin = String(
  process.env.APP_PUBLIC_URL || "https://sogrim-hesbon-app.vercel.app"
).replace(/\/+$/, "");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `qa-metrics-${suffix}@example.test`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const metricId = randomUUID();
const sessionId = randomUUID();
let userId = "";

try {
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Product Metrics QA" }
    }
  });
  userId = user.id;
  const session = await signInWithPassword(
    { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
    { email, password }
  );

  const response = await fetch(`${publicOrigin}/api/product-metrics`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      events: [{
        id: metricId,
        sessionId,
        eventName: "app_ready",
        screen: "home",
        platform: "web",
        appVersion: "qa-live",
        buildNumber: 0,
        detail: "",
        occurredAt: new Date().toISOString()
      }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    202,
    `Product metrics endpoint failed (${response.status}: ${payload?.error ?? "unknown"})`
  );
  assert.equal(payload?.accepted, 1);

  const rows = await serviceRequest(
    `/rest/v1/product_metrics?id=eq.${encodeURIComponent(metricId)}&select=id,event_name,screen,platform`
  );
  assert.deepEqual(rows, [{
    id: metricId,
    event_name: "app_ready",
    screen: "home",
    platform: "web"
  }]);
} finally {
  await serviceRequest(
    `/rest/v1/product_metrics?id=eq.${encodeURIComponent(metricId)}`,
    { method: "DELETE", prefer: "return=minimal" }
  ).catch(() => {});
  if (userId) {
    await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
  }
}

const remainingRows = await serviceRequest(
  `/rest/v1/product_metrics?id=eq.${encodeURIComponent(metricId)}&select=id`
);
assert.equal(remainingRows.length, 0);

console.log(JSON.stringify({
  ok: true,
  checks: {
    temporaryAccount: true,
    productionEndpointAccepted: true,
    metricStored: true,
    metricCleanup: true,
    accountCleanup: true
  }
}));

async function adminRequest(path, { method = "GET", body, prefer = "" } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message ||
        payload.msg ||
        payload.error ||
        `Supabase request failed (${response.status})`
    );
  }
  return payload;
}

function serviceRequest(path, options) {
  return adminRequest(path, options);
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for product metrics QA.`);
  return value;
}
