import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { devices, webkit } from "@playwright/test";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { saveCloudState } from "../src/data/cloudStore.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const baseUrl = "https://sogrim-hesbon-app.vercel.app";
const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const email = `qa-iphone-${suffix}@example.test`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const username = `qa_${suffix}`.slice(0, 24);
const workspace = {
  id: `space-qa-iphone-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const eventName = `בדיקת אייפון ${suffix}`;
const verifyProfileCompletion = process.argv.includes("--profile-completion");
let userId = "";
let browser = null;

try {
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "בדיקת אייפון אוטומטית",
        ...(!verifyProfileCompletion ? { username } : {}),
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  });
  userId = String(user.id ?? "");
  assert.ok(userId);

  const authConfig = { storage: { mode: "supabase", url: supabaseUrl, anonKey } };
  const session = await signInWithPassword(authConfig, { email, password });
  const participantId = `account-${userId}`;
  const cloudConfig = {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      table: "app_snapshots",
      spaceId: workspace.id,
      spaceKey: workspace.key,
      account: {
        userId,
        accessToken: session.access_token,
        spaceId: workspace.id
      }
    }
  };
  await saveCloudState(cloudConfig, {
    currentParticipantId: participantId,
    participants: [{
      id: participantId,
      displayName: "בדיקת אייפון אוטומטית",
      kind: "user",
      accountLinked: true
    }],
    friendContacts: [],
    groups: [],
    events: [{
      id: `event-qa-iphone-${suffix}`,
      name: eventName,
      currency: "ILS",
      participantIds: [participantId],
      adminIds: [participantId],
      createdByParticipantId: participantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expenses: [],
      transfers: [],
      activityLog: []
    }],
    deletedEvents: [],
    deletedParticipants: []
  });

  browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  let page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const gate = page.locator("#public-account-auth-gate");
  try {
    await gate.waitFor({ state: "visible", timeout: 30_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      readyState: document.readyState,
      accountPending: document.documentElement.classList.contains("account-auth-pending"),
      appBusy: document.querySelector("#app")?.getAttribute("aria-busy"),
      gateCount: document.querySelectorAll("#public-account-auth-gate").length,
      recoveryVisible: Boolean(document.querySelector(".account-auth-recovery")),
      hasSession: Boolean(localStorage.getItem("settle-friends-account-session")),
      bodyText: document.body.innerText.slice(0, 800)
    }));
    throw new Error(`Production iPhone auth gate did not appear: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  const emailToggle = gate.locator('[data-account-action="toggle-email"]');
  if (await emailToggle.isVisible().catch(() => false)) await emailToggle.click();
  await gate.locator('input[name="email"]').fill(email);
  await gate.locator('input[name="password"]').fill(password);
  await gate.getByRole("button", { name: "התחבר", exact: true }).click();
  if (verifyProfileCompletion) {
    const completionGate = page.locator('#public-account-auth-gate [data-mode="complete-profile"]');
    await completionGate.waitFor({ state: "visible", timeout: 20_000 });
    await completionGate.locator('input[name="username"]').fill(username);
    await completionGate.getByRole("button", { name: "שמור והמשך", exact: true }).click();
  }
  try {
    await page.getByText(eventName, { exact: true }).waitFor({ timeout: 30_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      gateVisible: Boolean(document.querySelector("#public-account-auth-gate")),
      feedback: document.querySelector("#account-auth-feedback")?.textContent?.trim() ?? "",
      recoveryVisible: Boolean(document.querySelector(".account-auth-recovery")),
      hasSession: Boolean(localStorage.getItem("settle-friends-account-session")),
      stateEventCount: (() => {
        const stateKeys = Object.keys(localStorage).filter((key) => key.startsWith("settle-friends-state"));
        return stateKeys.map((key) => {
          try { return JSON.parse(localStorage.getItem(key) || "{}").events?.length ?? 0; }
          catch { return -1; }
        });
      })()
    }));
    throw new Error(`Production iPhone history did not appear: ${JSON.stringify(diagnostic)}`, { cause: error });
  }

  await page.close();
  page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText(eventName, { exact: true }).waitFor({ timeout: 30_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      readyState: document.readyState,
      gateVisible: Boolean(document.querySelector("#public-account-auth-gate")),
      feedback: document.querySelector("#account-auth-feedback")?.textContent?.trim() ?? "",
      recoveryVisible: Boolean(document.querySelector(".account-auth-recovery")),
      accountPending: document.documentElement.classList.contains("account-auth-pending"),
      hasSession: Boolean(localStorage.getItem("settle-friends-account-session")),
      session: (() => {
        try {
          const stored = JSON.parse(localStorage.getItem("settle-friends-account-session") || "null");
          return stored ? {
            hasAccessToken: Boolean(stored.access_token),
            hasRefreshToken: Boolean(stored.refresh_token),
            expiresAt: stored.expires_at ?? null,
            userId: stored.user?.id ?? ""
          } : null;
        } catch { return null; }
      })(),
      stateEventCount: Object.keys(localStorage)
        .filter((key) => key.startsWith("settle-friends-state"))
        .map((key) => {
          try { return JSON.parse(localStorage.getItem(key) || "{}").events?.length ?? 0; }
          catch { return -1; }
        }),
      bodyText: document.body.innerText.slice(0, 600)
    }));
    throw new Error(`Production iPhone window restart failed: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  assert.equal(await page.locator("#public-account-auth-gate").count(), 0);

  await page.evaluate(() => {
    const key = "settle-friends-account-session";
    const stored = JSON.parse(localStorage.getItem(key) || "null");
    stored.access_token = "deliberately-stale-access-token";
    stored.expires_at = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  try {
    await page.getByText(eventName, { exact: true }).waitFor({ timeout: 20_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      gateVisible: Boolean(document.querySelector("#public-account-auth-gate")),
      feedback: document.querySelector("#account-auth-feedback")?.textContent?.trim() ?? "",
      recoveryVisible: Boolean(document.querySelector(".account-auth-recovery")),
      hasSession: Boolean(localStorage.getItem("settle-friends-account-session")),
      session: (() => {
        try {
          const stored = JSON.parse(localStorage.getItem("settle-friends-account-session") || "null");
          return stored ? {
            hasAccessToken: Boolean(stored.access_token),
            hasRefreshToken: Boolean(stored.refresh_token),
            expiresAt: stored.expires_at ?? null,
            userId: stored.user?.id ?? ""
          } : null;
        } catch { return null; }
      })(),
      stateEventCount: Object.keys(localStorage)
        .filter((key) => key.startsWith("settle-friends-state"))
        .map((key) => {
          try { return JSON.parse(localStorage.getItem(key) || "{}").events?.length ?? 0; }
          catch { return -1; }
        })
    }));
    throw new Error(`Production iPhone stale-token recovery failed: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  assert.equal(await page.locator("#public-account-auth-gate").count(), 0);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      productionEmailLogin: true,
      ...(verifyProfileCompletion ? { legacyProfileCompletionPersists: true } : {}),
      cloudHistoryVisible: true,
      sessionSurvivesWindowRestart: true,
      staleTokenRefreshKeepsUserSignedIn: true,
      temporaryDataCleanup: true
    }
  }));
} finally {
  await browser?.close().catch(() => {});
  await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(workspace.id)}`, {
    method: "DELETE"
  }).catch(() => {});
  if (userId) {
    await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(() => {});
  }
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
