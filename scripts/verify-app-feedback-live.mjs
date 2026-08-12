import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { submitAppFeedback } from "../src/data/appFeedback.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const accounts = ["author", "other"].map((role) => ({
  role,
  email: `qa-feedback-${role}-${suffix}@example.test`,
  userId: "",
  session: null
}));

let feedbackId = "";
try {
  for (const account of accounts) {
    const created = await adminRequest("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Feedback QA ${account.role}` }
      }
    });
    account.userId = created.id;
    account.session = await signInWithPassword(
      { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
      { email: account.email, password }
    );
  }

  const author = accounts[0];
  const other = accounts[1];
  assert.equal(
    await submitAppFeedback(feedbackConfig(author), {
      category: "bug",
      message: "Live QA feedback verifies secure cloud delivery",
      context: {
        appVersion: "qa",
        platform: "node",
        email: "must-not-be-stored@example.test"
      }
    }),
    true
  );

  const rows = await serviceRequest(
    `/rest/v1/app_feedback?user_id=eq.${author.userId}&select=id,user_id,category,message,context`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, author.userId);
  assert.equal(rows[0].context.email, undefined);
  feedbackId = rows[0].id;

  const foreignInsert = await fetch(`${supabaseUrl}/rest/v1/app_feedback`, {
    method: "POST",
    headers: accountHeaders(other),
    body: JSON.stringify({
      user_id: author.userId,
      category: "idea",
      message: "This cross-account insert must be rejected",
      context: {}
    })
  });
  assert.equal(foreignInsert.ok, false);

  const clientRead = await fetch(
    `${supabaseUrl}/rest/v1/app_feedback?select=id`,
    { headers: accountHeaders(author) }
  );
  assert.equal(clientRead.ok, false);
} finally {
  for (const account of [...accounts].reverse()) {
    if (!account.userId) continue;
    await adminRequest(
      `/auth/v1/admin/users/${encodeURIComponent(account.userId)}`,
      { method: "DELETE" }
    );
  }
}

const remainingRows = feedbackId
  ? await serviceRequest(`/rest/v1/app_feedback?id=eq.${feedbackId}&select=id`)
  : [];
assert.equal(remainingRows.length, 0);

console.log(JSON.stringify({
  ok: true,
  checks: {
    temporaryAccounts: true,
    feedbackStored: true,
    sensitiveContextFiltered: true,
    crossAccountInsertBlocked: true,
    clientReadBlocked: true,
    accountDeletionCleanup: true
  }
}));

function feedbackConfig(account) {
  return {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      account: {
        userId: account.userId,
        accessToken: account.session.access_token
      }
    }
  };
}

function accountHeaders(account) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${account.session.access_token}`,
    "content-type": "application/json"
  };
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
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

async function serviceRequest(path) {
  return adminRequest(path);
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for feedback QA.`);
  return value;
}
