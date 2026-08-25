import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.begin(async (transaction) => {
    const rows = await transaction`
      select
        snapshot.id,
        snapshot.snapshot_kind,
        snapshot.owner_user_id,
        snapshot.updated_at,
        snapshot.state
      from public.app_snapshots as snapshot
      where exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(snapshot.state -> 'participants', '[]'::jsonb)
        ) as participant(value)
        join public.user_profiles as profile
          on participant.value ->> 'id' = 'account-' || profile.user_id::text
        where nullif(profile.avatar_image, '') is not null
          and profile.avatar_image_updated_at is not null
          and (
            nullif(participant.value ->> 'avatarImageUpdatedAt', '') is null
            or (participant.value ->> 'avatarImageUpdatedAt')::timestamptz
              < profile.avatar_image_updated_at
            or (
              (participant.value ->> 'avatarImageUpdatedAt')::timestamptz
                = profile.avatar_image_updated_at
              and coalesce(participant.value ->> 'avatarImage', '')
                is distinct from coalesce(profile.avatar_image, '')
            )
          )
      )
      order by snapshot.snapshot_kind, snapshot.id
      for update of snapshot
    `;

    const profiles = await transaction`
      select user_id, avatar_image, avatar_image_updated_at
      from public.user_profiles
      where nullif(avatar_image, '') is not null
        and avatar_image_updated_at is not null
    `;
    const profileByParticipantId = new Map(
      profiles.map((profile) => [
        `account-${profile.user_id}`,
        {
          userId: String(profile.user_id),
          avatarImage: String(profile.avatar_image ?? ""),
          avatarImageUpdatedAt: new Date(profile.avatar_image_updated_at).toISOString()
        }
      ])
    );

    const proposed = [];
    for (const row of rows) {
      const nextState = structuredClone(row.state);
      const changedParticipantIds = [];
      nextState.participants = (nextState.participants ?? []).map((participant) => {
        const profile = profileByParticipantId.get(String(participant?.id ?? ""));
        if (!profile || !remoteAvatarWins(participant, profile)) return participant;
        changedParticipantIds.push(participant.id);
        return {
          ...participant,
          avatarImage: profile.avatarImage,
          avatarImageUpdatedAt: profile.avatarImageUpdatedAt
        };
      });
      if (!changedParticipantIds.length) continue;
      assertOnlyAvatarFieldsChanged(row.state, nextState, changedParticipantIds);
      proposed.push({ ...row, nextState, changedParticipantIds });
    }

    for (const row of proposed) {
      row.actorId = row.owner_user_id
        ? String(row.owner_user_id)
        : await sharedEventAdminUserId(transaction, row.id);
    }
    const repairable = proposed.filter((row) => row.actorId);
    const skipped = proposed.filter((row) => !row.actorId);
    const report = {
      mode: apply ? "apply" : "dry-run",
      changedSnapshotCount: proposed.length,
      repairableSnapshotCount: repairable.length,
      skippedSnapshotCount: skipped.length,
      changedParticipantReferenceCount: proposed.reduce(
        (total, row) => total + row.changedParticipantIds.length,
        0
      ),
      snapshots: proposed.map((row) => ({
        snapshotId: row.id,
        snapshotKind: row.snapshot_kind,
        changedParticipantIds: row.changedParticipantIds,
        repairable: Boolean(row.actorId)
      }))
    };

    if (!apply || !repairable.length) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(repairable);
    for (const row of repairable) {
      await transaction`
        select pg_catalog.set_config('request.jwt.claim.sub', ${row.actorId}, true)
      `;
      const updated = await transaction`
        update public.app_snapshots
        set state = ${transaction.json(row.nextState)},
            updated_at = pg_catalog.now()
        where id = ${row.id}
        returning id
      `;
      if (updated.length !== 1) {
        throw new Error(`Snapshot ${row.id} was not updated during avatar repair.`);
      }
    }

    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end({ timeout: 5 });
}

function remoteAvatarWins(participant, profile) {
  const localTime = Date.parse(String(participant?.avatarImageUpdatedAt ?? ""));
  const remoteTime = Date.parse(profile.avatarImageUpdatedAt);
  if (!Number.isFinite(remoteTime)) return false;
  if (!Number.isFinite(localTime) || remoteTime > localTime) return true;
  return (
    remoteTime === localTime &&
    String(participant?.avatarImage ?? "") !== profile.avatarImage
  );
}

function assertOnlyAvatarFieldsChanged(previousState, nextState, participantIds) {
  const stripChangedAvatars = (state) => ({
    ...state,
    participants: (state.participants ?? []).map((participant) =>
      participantIds.includes(participant.id)
        ? {
            ...participant,
            avatarImage: "<avatar>",
            avatarImageUpdatedAt: "<timestamp>"
          }
        : participant
    )
  });
  if (
    !isDeepStrictEqual(
      stripChangedAvatars(previousState),
      stripChangedAvatars(nextState)
    )
  ) {
    throw new Error("Avatar repair attempted to change non-avatar data.");
  }
}

async function sharedEventAdminUserId(transaction, snapshotId) {
  const rows = await transaction`
    select user_id
    from private.shared_snapshot_members
    where snapshot_id = ${snapshotId}
      and status = 'active'
      and role = 'admin'
    order by joined_at
    limit 1
  `;
  return rows[0]?.user_id ? String(rows[0].user_id) : "";
}

async function writeBackup(rows) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `avatar-snapshot-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        snapshots: rows.map((row) => ({
          id: row.id,
          snapshotKind: row.snapshot_kind,
          ownerUserId: row.owner_user_id,
          updatedAt: row.updated_at,
          changedParticipantIds: row.changedParticipantIds,
          state: row.state
        }))
      },
      null,
      2
    ),
    "utf8"
  );
  return backupPath;
}
