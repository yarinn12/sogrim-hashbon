import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";
import { validateSharedStatePayload } from "../src/server/stateValidation.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Supabase database URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  await sql.begin(async (transaction) => {
    const rows = await transaction`
      select snapshot.id, snapshot.owner_user_id, snapshot.state, snapshot.updated_at
      from public.app_snapshots as snapshot
      join auth.users as account on account.id = snapshot.owner_user_id
      where snapshot.snapshot_kind = 'workspace'
        and account.email_confirmed_at is not null
      for update of snapshot
    `;

    const candidates = rows.flatMap((row) => {
      const repaired = repairState(row.state);
      return repaired ? [{ ...row, ...repaired }] : [];
    });
    const report = {
      mode: apply ? "apply" : "dry-run",
      checkedWorkspaces: rows.length,
      repairableWorkspaces: candidates.length,
      repairedEvents: candidates.reduce((sum, row) => sum + row.eventCount, 0),
      workspaces: candidates.map((row) => ({
        snapshot: shortHash(row.id),
        repairedEvents: row.eventCount
      }))
    };

    if (!apply || !candidates.length) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(candidates);
    for (const row of candidates) {
      await transaction`
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${String(row.owner_user_id)},
          true
        )
      `;
      const updated = await transaction`
        update public.app_snapshots
        set state = ${transaction.json(row.nextState)}, updated_at = pg_catalog.now()
        where id = ${row.id}
        returning id
      `;
      if (updated.length !== 1) {
        throw new Error("Workspace changed during repair; transaction rolled back");
      }
    }

    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end({ timeout: 5 });
}

function repairState(state) {
  const validation = validateSharedStatePayload(state);
  if (validation.ok) return null;
  if (!validation.errors.every(isRepairableMembershipError)) return null;

  const currentParticipantId = String(state?.currentParticipantId ?? "").trim();
  const currentParticipantExists = (state?.participants ?? []).some(
    (participant) => participant?.id === currentParticipantId
  );
  if (!currentParticipantId || !currentParticipantExists) return null;

  const nextState = structuredClone(state);
  let eventCount = 0;
  for (const event of nextState.events ?? []) {
    if (event?.sharedSpaceId) continue;
    const referencedByCurrentParticipant =
      event?.createdByParticipantId === currentParticipantId ||
      (event?.adminIds ?? []).includes(currentParticipantId) ||
      (event?.expenses ?? []).some(
        (expense) => expense?.createdByParticipantId === currentParticipantId
      );
    if (
      referencedByCurrentParticipant &&
      !(event?.participantIds ?? []).includes(currentParticipantId)
    ) {
      event.participantIds = [currentParticipantId, ...(event.participantIds ?? [])];
      eventCount += 1;
    }
  }
  if (!eventCount) return null;

  const nextValidation = validateSharedStatePayload(nextState);
  if (!nextValidation.ok) {
    throw new Error(`Repair did not validate: ${nextValidation.errors.join(" ")}`);
  }
  assertOnlyCurrentMembershipWasAdded(state, nextState, currentParticipantId);
  return { nextState, eventCount };
}

function isRepairableMembershipError(message) {
  return /\.events\[\d+\](?:\.expenses\[\d+\])?\.(?:adminIds|createdByParticipantId) must belong to the event\.$/
    .test(String(message));
}

function assertOnlyCurrentMembershipWasAdded(previous, next, participantId) {
  const normalized = structuredClone(next);
  for (let index = 0; index < (normalized.events ?? []).length; index += 1) {
    const previousIds = previous.events?.[index]?.participantIds ?? [];
    const nextIds = normalized.events[index]?.participantIds ?? [];
    if (
      !previousIds.includes(participantId) &&
      nextIds[0] === participantId &&
      nextIds.slice(1).every((id, itemIndex) => id === previousIds[itemIndex])
    ) {
      normalized.events[index].participantIds = [...previousIds];
    }
  }
  if (JSON.stringify(normalized) !== JSON.stringify(previous)) {
    throw new Error("Repair attempted to modify data outside current participant membership");
  }
}

async function writeBackup(rows) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `current-participant-membership-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(rows.map((row) => ({
      id: row.id,
      ownerUserId: row.owner_user_id,
      updatedAt: row.updated_at,
      state: row.state
    })), null, 2),
    "utf8"
  );
  return backupPath;
}

function shortHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12);
}
