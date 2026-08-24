import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventName = process.argv.find((value) => value.startsWith("--event-name="))
  ?.slice("--event-name=".length)
  .trim();
const device = process.argv.find((value) => value.startsWith("--device="))
  ?.slice("--device=".length)
  .trim() || "emulator-5554";
const packageName = "com.sogrimhashbon.app";
if (!eventName) throw new Error("--event-name is required");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error("LOCALAPPDATA is required");
const adbPath = path.join(localAppData, "Android", "Sdk", "platform-tools", "adb.exe");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const rows = await sql`
    select
      event_record.event ->> 'id' as event_id,
      event_record.event ->> 'openInviteToken' as invite_token
    from public.app_snapshots as personal
    cross join lateral jsonb_array_elements(
      coalesce(personal.state -> 'events', '[]'::jsonb)
    ) as event_record(event)
    where personal.snapshot_kind = 'workspace'
      and event_record.event ->> 'name' = ${eventName}
      and nullif(event_record.event ->> 'openInviteToken', '') is not null
      and exists (
        select 1
        from public.event_invite_tokens as invite
        where invite.event_id = event_record.event ->> 'id'
          and invite.kind = 'open'
          and invite.revoked_at is null
          and invite.token_hash = encode(
            extensions.digest(event_record.event ->> 'openInviteToken', 'sha256'),
            'hex'
          )
      )
    order by personal.updated_at desc
    limit 1
  `;
  if (rows.length !== 1) {
    throw new Error(`No active invite was found for ${eventName}`);
  }

  const inviteUrl = new URL("https://sogrim-hesbon-app.vercel.app");
  inviteUrl.pathname = `/i/${encodeURIComponent(rows[0].event_id)}/t/${encodeURIComponent(rows[0].invite_token)}`;
  const result = spawnSync(
    adbPath,
    [
      "-s",
      device,
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      inviteUrl.toString(),
      packageName
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Android invite launch failed");
  }
  console.log(JSON.stringify({ ok: true, eventName, device, packageName }));
} finally {
  await sql.end({ timeout: 5 });
}
