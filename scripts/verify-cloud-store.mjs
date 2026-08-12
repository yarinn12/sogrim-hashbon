import { createHash, randomBytes, randomUUID } from "node:crypto";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const requiredVariables = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing ${variable}`);
  }
}

const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!anonKey) {
  throw new Error("Missing SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY");
}

const id = `qa-${randomUUID().replaceAll("-", "")}`;
const spaceKey = `${randomUUID()}${randomUUID()}`;
const accessKeyHash = createHash("sha256").update(spaceKey).digest("hex");
const endpoint = `${process.env.SUPABASE_URL}/rest/v1/app_snapshots`;
const email = `qa-cloud-${id}@example.test`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
let userId = "";
let accessToken = "";
const publicHeaders = {
  apikey: anonKey,
  authorization: `Bearer ${anonKey}`,
};

function accountHeaders(extra = {}) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${accessToken}`,
    ...extra
  };
}

async function readRows(key) {
  const response = await fetch(`${endpoint}?id=eq.${id}&select=id,state`, {
    headers: { ...publicHeaders, "x-space-key": key },
  });
  return { response, rows: await response.json() };
}

try {
  const createdUser = await serviceRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Cloud storage QA" }
    }
  });
  userId = createdUser.id;
  const signIn = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const session = await signIn.json();
  if (!signIn.ok || !session.access_token) {
    throw new Error(`Temporary cloud QA login failed (${signIn.status})`);
  }
  accessToken = session.access_token;
  const spaceHeaders = accountHeaders({
    "content-type": "application/json",
    prefer: "return=representation",
    "x-space-key": spaceKey
  });
  const insert = await fetch(endpoint, {
    method: "POST",
    headers: spaceHeaders,
    body: JSON.stringify({
      id,
      access_key_hash: accessKeyHash,
      state: { test: true, version: 1 },
    }),
  });
  const wrongRead = await readRows(randomUUID());
  const correctRead = await readRows(spaceKey);
  const missingKeyInsert = await fetch(endpoint, {
    method: "POST",
    headers: accountHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      id: `missing-${id}`,
      access_key_hash: accessKeyHash,
      state: { test: true },
    }),
  });
  const update = await fetch(`${endpoint}?id=eq.${id}`, {
    method: "PATCH",
    headers: spaceHeaders,
    body: JSON.stringify({ state: { test: true, version: 2 } }),
  });
  const updatedRead = await readRows(spaceKey);

  const result = {
    insertStatus: insert.status,
    wrongKeyRows: wrongRead.rows.length,
    correctKeyRows: correctRead.rows.length,
    missingKeyStatus: missingKeyInsert.status,
    updateStatus: update.status,
    updatedVersion: updatedRead.rows[0]?.state?.version,
  };
  console.log(JSON.stringify(result));

  const passed =
    [200, 201].includes(insert.status) &&
    wrongRead.response.ok &&
    wrongRead.rows.length === 0 &&
    correctRead.response.ok &&
    correctRead.rows.length === 1 &&
    missingKeyInsert.status >= 400 &&
    update.ok &&
    updatedRead.rows[0]?.state?.version === 2;

  if (!passed) {
    process.exitCode = 1;
  }
} finally {
  const serviceHeaders = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  await fetch(`${endpoint}?id=in.(${id},missing-${id})`, {
    method: "DELETE",
    headers: serviceHeaders,
  });
  if (userId) {
    await serviceRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
  }
}

async function serviceRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.msg || `Supabase request failed (${response.status})`);
  }
  return payload;
}
