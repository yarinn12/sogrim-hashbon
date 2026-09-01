import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";
import {
  readPrivateCredentials,
  resolvePrivateCredentialPath,
  writePrivateCredentials
} from "./privateMaterial.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const credentialsPath = resolvePrivateCredentialPath("inviteQa");

if (process.argv.includes("--delete")) {
  const credentials = readPrivateCredentials("inviteQa");
  if (credentials.workspaceId) {
    await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(credentials.workspaceId)}`, {
      method: "DELETE",
      prefer: "return=minimal"
    }).catch(() => {});
  }
  if (credentials.userId) {
    await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(credentials.userId)}`, {
      method: "DELETE"
    });
  }
  if (existsSync(credentialsPath)) unlinkSync(credentialsPath);
  console.log(JSON.stringify({ ok: true, deleted: true }));
  process.exit(0);
}

const existingCredentials = readPrivateCredentials("inviteQa");
const email = existingCredentials.email || "invite-tester@sogrimhashbon.app";
const password = existingCredentials.password || `${randomBytes(20).toString("base64url")}Aa1!`;
const listed = await adminRequest("/auth/v1/admin/users?page=1&per_page=1000");
let user = listed.users?.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
const workspaceId = user?.user_metadata?.account_space_id || `space-invite-qa-${Date.now()}`;
const workspaceKey = user?.user_metadata?.account_space_key || randomBytes(32).toString("base64url");
const userMetadata = {
  ...(user?.user_metadata || {}),
  full_name: "חבר בדיקה",
  account_space_id: workspaceId,
  account_space_key: workspaceKey
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
if (session.user?.id !== user.id) throw new Error("Invite QA account login verification failed.");

await writePrivateCredentials("inviteQa", {
  email,
  password,
  userId: user.id,
  workspaceId,
  updatedAt: new Date().toISOString()
});

console.log(JSON.stringify({ ok: true, email, credentialsPath }));

async function adminRequest(path, { method = "GET", body, prefer } = {}) {
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
    throw new Error(payload.message || payload.msg || payload.error || `Supabase request failed (${response.status})`);
  }
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for invite QA.`);
  return value;
}
