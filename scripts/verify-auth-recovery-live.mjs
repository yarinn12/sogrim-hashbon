import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  requestPasswordReset,
  signInWithPassword,
  updateAccountPassword
} from "../src/data/accountAuth.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const publicOrigin = String(
  process.env.APP_PUBLIC_URL || "https://sogrim-hesbon-app.vercel.app"
).replace(/\/+$/, "");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const originalPassword = `${randomBytes(18).toString("base64url")}Aa1!`;
const replacementPassword = `${randomBytes(18).toString("base64url")}Bb2!`;
const confirmedEmail = `qa-auth-recovery-${suffix}@example.test`;
const unconfirmedEmail = `qa-auth-unconfirmed-${suffix}@example.test`;
const missingEmail = `qa-auth-missing-${suffix}@example.test`;
const userIds = [];
const authConfig = {
  storage: { mode: "supabase", url: supabaseUrl, anonKey }
};

let result = null;

try {
  const settings = await publicAuthRequest("/auth/v1/settings");
  assert.equal(settings?.external?.email, true, "Email/password authentication is disabled");
  assert.equal(
    settings?.mailer_autoconfirm,
    false,
    "Email confirmation is disabled; unverified addresses can activate accounts"
  );

  const confirmedUser = await createTemporaryUser({
    email: confirmedEmail,
    password: originalPassword,
    confirmed: true,
    username: `qa_recovery_${suffix.replaceAll("-", "_")}`.slice(0, 24)
  });
  userIds.push(confirmedUser.id);
  const unconfirmedUser = await createTemporaryUser({
    email: unconfirmedEmail,
    password: originalPassword,
    confirmed: false,
    username: `qa_unconfirmed_${suffix.replaceAll("-", "_")}`.slice(0, 24)
  });
  userIds.push(unconfirmedUser.id);

  const originalSession = await signInWithPassword(authConfig, {
    email: confirmedEmail,
    password: originalPassword
  });
  assert.equal(originalSession?.user?.id, confirmedUser.id);

  await assert.rejects(
    signInWithPassword(authConfig, {
      email: unconfirmedEmail,
      password: originalPassword
    }),
    /email not confirmed/i
  );

  const recoveryRequestAccepted = await requestPasswordReset(
    authConfig,
    missingEmail,
    `${publicOrigin}/?auth_flow=qa-${suffix}`
  );
  assert.equal(
    recoveryRequestAccepted,
    true,
    "Password recovery endpoint did not preserve account-enumeration privacy"
  );

  const redirectTo = `${publicOrigin}/?auth_flow=qa-${suffix}`;
  const generated = await adminRequest("/auth/v1/admin/generate_link", {
    method: "POST",
    body: {
      type: "recovery",
      email: confirmedEmail,
      redirect_to: redirectTo
    }
  });
  const tokenHash = String(generated?.hashed_token ?? "");
  const actionLink = String(generated?.action_link ?? "");
  assert.ok(tokenHash, "Recovery link did not include a one-time token hash");
  assert.ok(actionLink, "Recovery action link was not generated");
  const actionRedirect = new URL(actionLink).searchParams.get("redirect_to");
  assert.equal(actionRedirect, redirectTo, "Recovery link does not return to the production app");

  const recoverySession = await publicAuthRequest("/auth/v1/verify", {
    method: "POST",
    body: { type: "recovery", token_hash: tokenHash }
  });
  assert.equal(recoverySession?.user?.id, confirmedUser.id);
  assert.ok(recoverySession?.access_token);
  assert.ok(recoverySession?.refresh_token);

  await updateAccountPassword(
    authConfig,
    recoverySession,
    replacementPassword
  );
  await assert.rejects(
    signInWithPassword(authConfig, {
      email: confirmedEmail,
      password: originalPassword
    }),
    /invalid login credentials/i
  );
  const replacementSession = await signInWithPassword(authConfig, {
    email: confirmedEmail,
    password: replacementPassword
  });
  assert.equal(replacementSession?.user?.id, confirmedUser.id);

  result = {
    ok: true,
    checks: {
      emailPasswordProviderEnabled: true,
      emailConfirmationRequired: true,
      unconfirmedLoginBlocked: true,
      enumerationSafeRecoveryRequest: true,
      recoveryLinkTargetsProduction: true,
      recoveryTokenExchange: true,
      passwordChanged: true,
      oldPasswordRejected: true,
      newPasswordAccepted: true
    }
  };
} finally {
  const cleanupErrors = [];
  for (const userId of userIds.reverse()) {
    try {
      await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Temporary auth QA cleanup failed");
  }
}

console.log(JSON.stringify({
  ...result,
  checks: { ...result.checks, temporaryAccountsCleaned: true }
}));

async function createTemporaryUser({ email, password, confirmed, username }) {
  return adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: confirmed,
      user_metadata: {
        full_name: "בדיקת אימות חשבון",
        username,
        account_space_id: `space-${username}`,
        account_space_key: randomBytes(32).toString("base64url")
      }
    }
  });
}

async function publicAuthRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      "content-type": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.message || payload.msg || payload.error || `Supabase request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return payload;
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message || payload.msg || payload.error || `Supabase admin request failed (${response.status})`
    );
  }
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for live authentication QA`);
  return value;
}
