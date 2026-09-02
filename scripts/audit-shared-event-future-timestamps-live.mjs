import { createHash } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

const root = process.cwd();
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

const scalarFields = [
  "membershipUpdatedAt",
  "statusUpdatedAt",
  "adminIdsUpdatedAt",
  "settingsUpdatedAt"
];
const mapFields = [
  "membershipUpdatedAtByParticipant",
  "settingsFieldUpdatedAt"
];

try {
  const rows = await sql`
    select id, state
    from public.app_snapshots
    where snapshot_kind = 'shared_event'
  `;
  const now = Date.now();
  const cutoff = now + 5 * 60 * 1000;
  const futureValues = [];

  for (const row of rows) {
    const event = row.state?.events?.[0];
    if (!event) continue;
    for (const field of scalarFields) {
      collectFutureValue(futureValues, cutoff, row.id, event.id, field, event[field]);
    }
    for (const mapField of mapFields) {
      const values = event[mapField];
      if (!values || typeof values !== "object" || Array.isArray(values)) continue;
      for (const [key, value] of Object.entries(values)) {
        collectFutureValue(
          futureValues,
          cutoff,
          row.id,
          event.id,
          `${mapField}.${shortHash(key)}`,
          value
        );
      }
    }
  }

  console.log(JSON.stringify({
    ok: futureValues.length === 0,
    checkedAt: new Date(now).toISOString(),
    sharedSnapshots: rows.length,
    futureValues
  }, null, 2));
  if (futureValues.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

function collectFutureValue(output, cutoff, snapshotId, eventId, field, value) {
  if (typeof value !== "string" || !value) return;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= cutoff) return;
  output.push({
    snapshot: shortHash(snapshotId),
    event: shortHash(eventId),
    field,
    value
  });
}

function shortHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12);
}
