import { randomBytes } from "node:crypto";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";
import {
  readPrivateCredentials,
  writePrivateCredentials
} from "./privateMaterial.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const existingCredentials = readPrivateCredentials("storeReview");
const email = existingCredentials.email || "store-review@sogrimhashbon.app";
const password = existingCredentials.password || `${randomBytes(20).toString("base64url")}Aa1!`;

const listed = await adminRequest("/auth/v1/admin/users?page=1&per_page=1000");
let user = listed.users?.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
const userMetadata = {
  ...(user?.user_metadata || {}),
  full_name: "בודק חנות",
  account_space_id: user?.user_metadata?.account_space_id || "space-store-review",
  account_space_key: user?.user_metadata?.account_space_key || randomBytes(32).toString("base64url")
};

if (user) {
  user = await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: { password, email_confirm: true, user_metadata: userMetadata }
  });
} else {
  user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: userMetadata }
  });
}

const session = await signInWithPassword(
  { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
  { email, password }
);
if (session.user?.id !== user.id) throw new Error("Store review account login verification failed.");

const credentialsPath = await writePrivateCredentials("storeReview", {
  email,
  password,
  userId: user.id,
  updatedAt: new Date().toISOString(),
  purpose: "Private App Store Connect and Google Play review credentials"
});

console.log(JSON.stringify({ ok: true, email, credentialsPath }));

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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.msg || payload.error || `Supabase request failed (${response.status})`);
  }
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for the store review account.`);
  return value;
}
