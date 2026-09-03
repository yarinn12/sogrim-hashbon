import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";

import { buildSharedEventState } from "../src/data/sharedEventStore.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import { ensureNamedParticipant } from "../src/domain/userProfile.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.begin(async (transaction) => {
    const stranded = await transaction`
      select
        shared.id as snapshot_id,
        shared.state as shared_state,
        shared.state -> 'events' -> 0 ->> 'id' as event_id,
        shared.state -> 'events' -> 0 ->> 'name' as event_name,
        member.user_id,
        member.participant_id,
        member.pending_join_until,
        workspace.id as workspace_id,
        workspace.state as workspace_state,
        admin.user_id as admin_user_id,
        admin.participant_id as admin_participant_id
      from private.shared_snapshot_members as member
      join public.app_snapshots as shared
        on shared.id = member.snapshot_id
       and shared.snapshot_kind = 'shared_event'
      join auth.users as account on account.id = member.user_id
      join public.app_snapshots as workspace
        on workspace.id = account.raw_user_meta_data ->> 'account_space_id'
       and workspace.snapshot_kind = 'workspace'
       and workspace.owner_user_id = member.user_id
      join lateral (
        select candidate.user_id, candidate.participant_id
        from private.shared_snapshot_members as candidate
        where candidate.snapshot_id = shared.id
          and candidate.status = 'active'
          and candidate.role = 'admin'
          and coalesce(
            shared.state -> 'events' -> 0 -> 'participantIds',
            '[]'::jsonb
          ) ? candidate.participant_id
        order by candidate.joined_at, candidate.user_id
        limit 1
      ) as admin on true
      where member.status = 'active'
        and member.pending_join_until is not null
        and member.pending_join_until <= pg_catalog.clock_timestamp()
        and not coalesce(
          shared.state -> 'events' -> 0 -> 'participantIds',
          '[]'::jsonb
        ) ? member.participant_id
        and exists (
          select 1
          from public.event_invite_tokens as invite
          where invite.space_id = shared.id
            and invite.event_id = shared.state -> 'events' -> 0 ->> 'id'
            and invite.kind = 'open'
            and invite.last_redeemed_at is not null
            and invite.revoked_at is null
            and (invite.expires_at is null or invite.expires_at > pg_catalog.now())
        )
      order by member.updated_at
      for update of shared, member, workspace
    `;

    if (stranded.length > 10) {
      throw new Error(
        `Refusing to repair ${stranded.length} joins in one run; investigate first.`
      );
    }

    const repairs = stranded.map(prepareRepair);
    const report = {
      ok: true,
      mode: apply ? "apply" : "dry-run",
      checkedAt: new Date().toISOString(),
      strandedCount: repairs.length,
      repairs: repairs.map((repair) => ({
        eventId: repair.eventId,
        eventName: repair.eventName,
        snapshotId: repair.snapshotId,
        workspaceId: repair.workspaceId,
        participantId: repair.participantId,
        pendingJoinUntil: repair.pendingJoinUntil,
        participantCountBefore: repair.previousEvent.participantIds.length,
        participantCountAfter: repair.nextEvent.participantIds.length,
        expenseCount: repair.previousEvent.expenses?.length ?? 0,
        transferCount: repair.previousEvent.transfers?.length ?? 0
      }))
    };

    if (!apply || repairs.length === 0) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(repairs);
    for (const repair of repairs) {
      await transaction`
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${String(repair.adminUserId)},
          true
        )
      `;
      const updated = await transaction`
        update public.app_snapshots
        set
          state = ${transaction.json(repair.nextSharedState)},
          updated_at = pg_catalog.now()
        where id = ${repair.snapshotId}
          and state = ${transaction.json(repair.previousSharedState)}
        returning id
      `;
      if (updated.length !== 1) {
        throw new Error(
          `Shared event ${repair.snapshotId} changed during the repair.`
        );
      }

      const [indexed] = await transaction`
        select public.index_shared_event_for_member(
          ${repair.snapshotId},
          ${repair.userId}::uuid
        ) as result
      `;
      if (!indexed?.result) {
        throw new Error(
          `Personal workspace indexing failed for ${repair.snapshotId}.`
        );
      }
    }

    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end({ timeout: 5 });
}

function prepareRepair(row) {
  const eventId = String(row.event_id ?? "");
  const participantId = String(row.participant_id ?? "");
  const profile = row.workspace_state?.participants?.find(
    (participant) => participant.id === participantId
  );
  if (!eventId || !profile) {
    throw new Error("The stranded account profile or event is unavailable.");
  }

  const previousEvent = row.shared_state?.events?.find(
    (event) => event.id === eventId
  );
  if (!previousEvent || previousEvent.participantIds?.includes(participantId)) {
    throw new Error("The stranded membership changed during preparation.");
  }

  const joinedState = ensureNamedParticipant(
    {
      ...structuredClone(row.shared_state),
      currentParticipantId: String(row.admin_participant_id ?? "")
    },
    profile,
    eventId,
    { reactivateInactive: false }
  );
  const nextSharedState = buildSharedEventState(joinedState, eventId);
  const nextEvent = nextSharedState?.events?.find((event) => event.id === eventId);
  if (!nextEvent?.participantIds?.includes(participantId)) {
    throw new Error("The account could not be added to canonical membership.");
  }
  if (!isDeepStrictEqual(previousEvent.expenses ?? [], nextEvent.expenses ?? [])) {
    throw new Error("The repair would change event expenses.");
  }
  if (!isDeepStrictEqual(previousEvent.transfers ?? [], nextEvent.transfers ?? [])) {
    throw new Error("The repair would change settlement transfers.");
  }

  const validationErrors = validateSharedStateFinancials(
    nextSharedState,
    String(row.snapshot_id ?? "")
  );
  if (validationErrors.length) {
    throw new Error(validationErrors.join(" "));
  }

  return {
    snapshotId: String(row.snapshot_id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    eventId,
    eventName: String(row.event_name ?? ""),
    userId: String(row.user_id ?? ""),
    participantId,
    adminUserId: String(row.admin_user_id ?? ""),
    pendingJoinUntil: row.pending_join_until,
    previousSharedState: row.shared_state,
    previousEvent,
    nextSharedState,
    nextEvent
  };
}

async function writeBackup(repairs) {
  const directory = path.resolve("work", "repairs");
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(
    directory,
    `stranded-invite-joins-${Date.now()}.json`
  );
  await fs.writeFile(
    filePath,
    JSON.stringify(
      repairs.map((repair) => ({
        snapshotId: repair.snapshotId,
        workspaceId: repair.workspaceId,
        userId: repair.userId,
        previousSharedState: repair.previousSharedState
      })),
      null,
      2
    ),
    "utf8"
  );
  return filePath;
}
