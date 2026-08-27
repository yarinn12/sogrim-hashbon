import postgres from "postgres";
import { broadcastAuthorizationToken } from
  "../src/server/broadcastNotifications.mjs";

const DEFAULT_TITLE = "זה הזמן לסגור חשבון 👀";
const DEFAULT_BODY =
  "פתחו את האפליקציה, סדרו את ההוצאות וסגרו את החשבון בלי כאב ראש ✨";
const DEFAULT_PUBLIC_URL = "https://sogrim-hesbon-app.vercel.app";

const shouldSend = process.argv.includes("--send");
const title = String(process.env.BROADCAST_TITLE || DEFAULT_TITLE).trim();
const body = String(process.env.BROADCAST_BODY || DEFAULT_BODY).trim();
const campaignId = String(
  process.env.BROADCAST_CAMPAIGN_ID || "close-account-test-2026-08-27"
).trim();
const publicUrl = String(
  process.env.APP_PUBLIC_URL || DEFAULT_PUBLIC_URL
).replace(/\/+$/, "");
const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const connection =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!connection) throw new Error("Missing database connection");
if (!serviceRoleKey) throw new Error("Missing Supabase service role key");
if (!title || !body || !campaignId) {
  throw new Error("Notification title, body, and campaign ID are required");
}

const sql = postgres(connection, {
  prepare: false,
  ssl: "require"
});

try {
  const rows = await sql.unsafe(
    "select user_id, token from public.push_devices where enabled = true order by updated_at desc"
  );
  const devices = [
    ...new Map(
      rows
        .filter((row) => String(row.token || "").trim())
        .map((row) => [row.token, row])
    ).values()
  ];
  const users = new Set(devices.map((device) => device.user_id)).size;

  if (!shouldSend) {
    console.log(JSON.stringify({
      mode: "dry-run",
      title,
      body,
      campaignId,
      targetedDevices: devices.length,
      targetedUsers: users
    }));
  } else {
    const response = await fetch(
      `${publicUrl}/api/admin/notifications/broadcast`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${broadcastAuthorizationToken(serviceRoleKey)}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ title, body, campaignId })
      }
    );
    const payload = await response.json().catch(() => ({}));
    console.log(JSON.stringify({ status: response.status, ...payload }));
    if (!response.ok || !payload?.ok) process.exitCode = 1;
  }
} finally {
  await sql.end();
}
