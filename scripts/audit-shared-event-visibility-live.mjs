import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const rows = await sql`
    select
      member.user_id,
      member.participant_id,
      member.snapshot_id,
      member.role,
      member.status,
      member.updated_at as membership_updated_at,
      profile.display_name,
      profile.username,
      shared.state as shared_state,
      shared.updated_at as shared_updated_at,
      account.raw_user_meta_data ->> 'account_space_id' as workspace_id,
      workspace.state as workspace_state,
      workspace.updated_at as workspace_updated_at
    from private.shared_snapshot_members as member
    join public.app_snapshots as shared
      on shared.id = member.snapshot_id
     and shared.snapshot_kind = 'shared_event'
    join auth.users as account on account.id = member.user_id
    left join public.user_profiles as profile on profile.user_id = member.user_id
    left join public.app_snapshots as workspace
      on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
    where member.status = 'active'
    order by member.updated_at desc, member.user_id, member.snapshot_id
  `;
  const duplicateRows = await sql`
    select
      snapshot.state #>> '{events,0,id}' as event_id,
      jsonb_agg(snapshot.id order by snapshot.updated_at desc) as snapshot_ids
    from public.app_snapshots as snapshot
    where snapshot.snapshot_kind = 'shared_event'
      and nullif(snapshot.state #>> '{events,0,id}', '') is not null
    group by snapshot.state #>> '{events,0,id}'
    having count(*) > 1
  `;

  const memberships = rows.map((row) => {
    const sharedEvent = row.shared_state?.events?.[0] ?? null;
    const eventId = String(sharedEvent?.id ?? "");
    const personalEvent = row.workspace_state?.events?.find(
      (event) => String(event?.id ?? "") === eventId
    );
    const sharedParticipantIds = Array.isArray(sharedEvent?.participantIds)
      ? sharedEvent.participantIds.map(String)
      : [];
    const personalParticipantIds = Array.isArray(personalEvent?.participantIds)
      ? personalEvent.participantIds.map(String)
      : [];
    const sharedNotes = Array.isArray(sharedEvent?.notes) ? sharedEvent.notes : [];
    const personalNotes = Array.isArray(personalEvent?.notes) ? personalEvent.notes : [];
    const sharedDeletedNotes = Array.isArray(sharedEvent?.deletedNotes)
      ? sharedEvent.deletedNotes
      : [];
    const personalDeletedNotes = Array.isArray(personalEvent?.deletedNotes)
      ? personalEvent.deletedNotes
      : [];
    return {
      userId: row.user_id,
      displayName: row.display_name ?? "",
      username: row.username ?? "",
      participantId: row.participant_id,
      snapshotId: row.snapshot_id,
      eventId,
      eventName: String(sharedEvent?.name ?? ""),
      role: row.role,
      membershipUpdatedAt: row.membership_updated_at,
      sharedUpdatedAt: row.shared_updated_at,
      workspaceUpdatedAt: row.workspace_updated_at,
      workspaceId: row.workspace_id,
      sharedParticipantIds,
      workspaceParticipantIds: personalParticipantIds,
      sharedHasCanonicalParticipant: sharedParticipantIds.includes(
        String(row.participant_id)
      ),
      workspaceHasEvent: Boolean(personalEvent),
      workspaceEventHasCanonicalParticipant: personalParticipantIds.includes(
        String(row.participant_id)
      ),
      workspaceNotesMatchCanonical:
        JSON.stringify(personalNotes) === JSON.stringify(sharedNotes),
      workspaceDeletedNotesMatchCanonical:
        JSON.stringify(personalDeletedNotes) === JSON.stringify(sharedDeletedNotes)
    };
  });

  const anomalies = memberships.filter(
    (item) =>
      !item.eventId ||
      !item.workspaceId ||
      !item.sharedHasCanonicalParticipant ||
      (item.workspaceHasEvent && !item.workspaceEventHasCanonicalParticipant) ||
      (item.workspaceHasEvent && !item.workspaceNotesMatchCanonical) ||
      (item.workspaceHasEvent && !item.workspaceDeletedNotesMatchCanonical)
  );
  const recoverableIndexes = memberships.filter(
    (item) => item.eventId && item.sharedHasCanonicalParticipant && !item.workspaceHasEvent
  );

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        readOnly: true,
        ok: anomalies.length === 0 && recoverableIndexes.length === 0 && duplicateRows.length === 0,
        activeMemberships: memberships.length,
        duplicateEventIdentities: duplicateRows,
        anomalies,
        recoverableIndexes,
        memberships
      },
      null,
      2
    )
  );
  if (anomalies.length || recoverableIndexes.length) process.exitCode = 1;
  if (duplicateRows.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
