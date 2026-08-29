import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");
const includeState = process.argv.includes("--details");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const rows = await sql`
    with shared as (
      select
        snapshot.id as snapshot_id,
        snapshot.updated_at,
        snapshot.state,
        nullif(snapshot.state #>> '{events,0,id}', '') as event_id,
        snapshot.state #>> '{events,0,name}' as event_name
      from public.app_snapshots as snapshot
      where snapshot.snapshot_kind = 'shared_event'
    ), duplicates as (
      select event_id
      from shared
      where event_id is not null
      group by event_id
      having count(*) > 1
    )
    select
      shared.snapshot_id,
      shared.event_id,
      shared.event_name,
      shared.updated_at,
      jsonb_array_length(coalesce(shared.state #> '{events,0,participantIds}', '[]'::jsonb))
        as participant_count,
      jsonb_array_length(coalesce(shared.state #> '{events,0,expenses}', '[]'::jsonb))
        as expense_count,
      jsonb_array_length(coalesce(shared.state #> '{events,0,deletedExpenses}', '[]'::jsonb))
        as deleted_expense_count,
      jsonb_array_length(coalesce(shared.state #> '{events,0,transfers}', '[]'::jsonb))
        as transfer_count,
      (
        select count(*)::integer
        from private.shared_snapshot_members as member
        where member.snapshot_id = shared.snapshot_id
          and member.status = 'active'
          and member.removed_at is null
      ) as active_member_count,
      (
        select count(*)::integer
        from public.event_invite_tokens as invite
        where invite.space_id = shared.snapshot_id
          and invite.revoked_at is null
      ) as active_invite_count,
      (
        select count(*)::integer
        from public.app_snapshots as personal
        cross join lateral jsonb_array_elements(
          coalesce(personal.state -> 'events', '[]'::jsonb)
        ) as event_record(event)
        where personal.snapshot_kind = 'workspace'
          and event_record.event ->> 'id' = shared.event_id
          and event_record.event ->> 'sharedSpaceId' = shared.snapshot_id
      ) as personal_reference_count,
      shared.state
    from shared
    join duplicates using (event_id)
    order by shared.event_id, shared.updated_at desc
  `;

  const reportedRows = rows.map((row) => includeState
    ? row
    : Object.fromEntries(Object.entries(row).filter(([key]) => key !== "state")));
  const grouped = Object.groupBy(reportedRows, (row) => row.event_id);
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    readOnly: true,
    duplicateEventCount: Object.keys(grouped).length,
    duplicates: grouped
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
