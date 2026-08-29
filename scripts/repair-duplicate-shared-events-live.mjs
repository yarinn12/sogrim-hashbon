import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const snapshots = await duplicateSnapshots(sql);
  const plans = buildRepairPlans(snapshots);
  if (!plans.length) {
    console.log(JSON.stringify({ applied: false, duplicateEventCount: 0 }, null, 2));
    process.exitCode = 0;
  } else {
    const candidateIds = plans.flatMap((plan) =>
      plan.candidates.map((candidate) => candidate.id)
    );
    const backup = await loadBackupRows(sql, candidateIds);
    validateBackupAndPlans(plans, backup);

    if (!apply) {
      console.log(JSON.stringify({
        applied: false,
        dryRun: true,
        duplicateEventCount: plans.length,
        plans: reportPlans(plans)
      }, null, 2));
    } else {
      const backupPath = await writeBackup(backup, plans);
      await sql.begin(async (transaction) => {
        const currentSnapshots = await duplicateSnapshots(transaction);
        const currentPlans = buildRepairPlans(currentSnapshots);
        if (JSON.stringify(reportPlans(currentPlans)) !== JSON.stringify(reportPlans(plans))) {
          throw new Error("Duplicate snapshot set changed after backup; refusing repair");
        }

        for (const snapshotId of candidateIds) {
          const [safety] = await transaction`
            select
              (
                select count(*)::integer
                from public.app_snapshots as personal
                cross join lateral jsonb_array_elements(
                  coalesce(personal.state -> 'events', '[]'::jsonb)
                ) as event_record(event)
                where personal.snapshot_kind = 'workspace'
                  and event_record.event ->> 'sharedSpaceId' = ${snapshotId}
              ) as personal_references,
              (
                select count(*)::integer
                from public.event_invite_tokens as invite
                where invite.space_id = ${snapshotId}
                  and invite.revoked_at is null
              ) as active_invites
          `;
          if (safety.personal_references !== 0 || safety.active_invites !== 0) {
            throw new Error(`Snapshot ${snapshotId} became active; refusing repair`);
          }
        }

        await transaction`
          delete from public.app_snapshots
          where id = any(${transaction.array(candidateIds)}::text[])
        `;
      });

      console.log(JSON.stringify({
        applied: true,
        backupPath,
        removedSnapshotIds: candidateIds,
        canonicalSnapshotIds: plans.map((plan) => plan.canonical.id)
      }, null, 2));
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function duplicateSnapshots(database) {
  return database`
    with shared as (
      select
        snapshot.*,
        nullif(snapshot.state #>> '{events,0,id}', '') as event_id,
        (
          select count(*)::integer
          from public.app_snapshots as personal
          cross join lateral jsonb_array_elements(
            coalesce(personal.state -> 'events', '[]'::jsonb)
          ) as event_record(event)
          where personal.snapshot_kind = 'workspace'
            and event_record.event ->> 'sharedSpaceId' = snapshot.id
        ) as personal_reference_count,
        (
          select count(*)::integer
          from public.event_invite_tokens as invite
          where invite.space_id = snapshot.id
            and invite.revoked_at is null
        ) as active_invite_count,
        (
          select coalesce(jsonb_agg(member.participant_id order by member.participant_id), '[]'::jsonb)
          from private.shared_snapshot_members as member
          where member.snapshot_id = snapshot.id
            and member.status = 'active'
            and member.removed_at is null
        ) as active_member_ids
      from public.app_snapshots as snapshot
      where snapshot.snapshot_kind = 'shared_event'
    )
    select shared.*
    from shared
    where shared.event_id in (
      select event_id
      from shared
      where event_id is not null
      group by event_id
      having count(*) > 1
    )
    order by shared.event_id, shared.updated_at desc
  `;
}

function buildRepairPlans(rows) {
  const groups = Object.groupBy(rows, (row) => row.event_id);
  return Object.entries(groups).map(([eventId, group]) => {
    const ranked = [...group].sort((left, right) =>
      right.personal_reference_count - left.personal_reference_count ||
      right.active_invite_count - left.active_invite_count ||
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
    );
    const canonical = ranked[0];
    const candidates = ranked.slice(1);
    if (canonical.personal_reference_count < 1 && canonical.active_invite_count < 1) {
      throw new Error(`Event ${eventId} has no referenced canonical snapshot`);
    }
    for (const candidate of candidates) {
      validateSafeCandidate(canonical, candidate);
    }
    return { eventId, canonical, candidates };
  });
}

function validateSafeCandidate(canonical, candidate) {
  if (candidate.personal_reference_count !== 0) {
    throw new Error(`Duplicate ${candidate.id} is still referenced by a personal workspace`);
  }
  if (candidate.active_invite_count !== 0) {
    throw new Error(`Duplicate ${candidate.id} still has an active invite`);
  }

  const canonicalEvent = canonical.state?.events?.[0] ?? {};
  const candidateEvent = candidate.state?.events?.[0] ?? {};
  if (canonicalEvent.id !== candidateEvent.id) {
    throw new Error(`Duplicate ${candidate.id} has a mismatched event id`);
  }
  if (canonicalEvent.name !== candidateEvent.name) {
    throw new Error(`Duplicate ${candidate.id} has a mismatched event name`);
  }

  requireSubset(candidate.active_member_ids, canonical.active_member_ids, "active member", candidate.id);
  requireSubset(candidateEvent.participantIds, canonicalEvent.participantIds, "participant", candidate.id);
  requireEntitySubset(candidateEvent.expenses, canonicalEvent.expenses, candidate.id, [
    "id", "name", "total", "payers", "sharedByParticipantIds",
    "createdByParticipantId", "occurredOn", "attachmentImage", "notes"
  ]);
  requireEntitySubset(candidateEvent.transfers, canonicalEvent.transfers, candidate.id, [
    "id", "amount", "fromParticipantId", "toParticipantId"
  ]);
  requireEntitySubset(candidateEvent.deletedExpenses, canonicalEvent.deletedExpenses, candidate.id, [
    "id"
  ]);
  requireEntitySubset(candidateEvent.activityLog, canonicalEvent.activityLog, candidate.id, [
    "id", "kind", "actorParticipantId", "subjectParticipantId", "entityId"
  ]);
  requireEntitySubset(candidate.state?.deletedParticipants, canonical.state?.deletedParticipants, candidate.id, [
    "id", "targetParticipantId", "reason"
  ]);
}

function requireSubset(candidateValues = [], canonicalValues = [], label, snapshotId) {
  const canonical = new Set((canonicalValues ?? []).map(String));
  for (const value of candidateValues ?? []) {
    if (!canonical.has(String(value))) {
      throw new Error(`Duplicate ${snapshotId} contains a unique ${label}: ${value}`);
    }
  }
}

function requireEntitySubset(candidateValues = [], canonicalValues = [], snapshotId, keys) {
  const canonical = new Map((canonicalValues ?? []).map((value) => [String(value?.id ?? ""), value]));
  for (const candidate of candidateValues ?? []) {
    const match = canonical.get(String(candidate?.id ?? ""));
    if (!match) {
      throw new Error(`Duplicate ${snapshotId} contains a unique entity: ${candidate?.id}`);
    }
    for (const key of keys) {
      if (candidate?.[key] === undefined) continue;
      if (JSON.stringify(candidate[key]) !== JSON.stringify(match[key])) {
        throw new Error(`Duplicate ${snapshotId} differs at ${candidate?.id}.${key}`);
      }
    }
  }
}

async function loadBackupRows(database, snapshotIds) {
  const [snapshots, members, invites, qualificationActivity, tombstoneRecipients] = await Promise.all([
    database`select * from public.app_snapshots where id = any(${database.array(snapshotIds)}::text[]) order by id`,
    database`select * from private.shared_snapshot_members where snapshot_id = any(${database.array(snapshotIds)}::text[]) order by snapshot_id, user_id`,
    database`select * from public.event_invite_tokens where space_id = any(${database.array(snapshotIds)}::text[]) order by space_id, created_at`,
    database`select * from private.shared_event_qualification_activity where snapshot_id = any(${database.array(snapshotIds)}::text[]) order by snapshot_id, recorded_at`,
    database`select * from private.shared_snapshot_tombstone_recipients where snapshot_id = any(${database.array(snapshotIds)}::text[]) order by snapshot_id, user_id`
  ]);
  return { snapshots, members, invites, qualificationActivity, tombstoneRecipients };
}

function validateBackupAndPlans(plans, backup) {
  const expectedIds = new Set(plans.flatMap((plan) => plan.candidates.map((candidate) => candidate.id)));
  const backedUpIds = new Set(backup.snapshots.map((snapshot) => snapshot.id));
  if (expectedIds.size !== backedUpIds.size || [...expectedIds].some((id) => !backedUpIds.has(id))) {
    throw new Error("Backup does not cover every duplicate candidate");
  }
  if (backup.qualificationActivity.length || backup.tombstoneRecipients.length) {
    throw new Error("A duplicate snapshot has protected activity history; refusing repair");
  }
}

async function writeBackup(backup, plans) {
  const workspaceRoot = path.resolve(".");
  const backupDirectory = path.resolve("audit", "backups");
  if (!backupDirectory.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Backup directory escaped the workspace");
  }
  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupPath = path.join(backupDirectory, `shared-event-duplicates-${timestamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    plans: reportPlans(plans),
    backup
  }, jsonReplacer, 2));
  return backupPath;
}

function reportPlans(plans) {
  return plans.map((plan) => ({
    eventId: plan.eventId,
    canonicalSnapshotId: plan.canonical.id,
    duplicateSnapshotIds: plan.candidates.map((candidate) => candidate.id)
  }));
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
