import { createHash } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";
import { validateSharedStatePayload } from "../src/server/stateValidation.mjs";

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

try {
  const rows = await sql`
    select
      snapshot.id,
      snapshot.snapshot_kind,
      snapshot.state,
      exists (
        select 1
        from auth.users as account
        where account.id = snapshot.owner_user_id
          and account.email_confirmed_at is not null
      ) as confirmed_owner,
      exists (
        select 1
        from private.shared_snapshot_members as member
        where member.snapshot_id = snapshot.id
          and member.status = 'active'
      ) as active_membership
    from public.app_snapshots as snapshot
  `;

  const invalid = rows.flatMap((row) => {
    const validation = validateSharedStatePayload(row.state);
    if (validation.ok) return [];
    return [{
      snapshot: shortHash(row.id),
      kind: row.snapshot_kind,
      live: Boolean(row.confirmed_owner || row.active_membership),
      errors: validation.errors.slice(0, 8),
      events: invalidEventIndexes(validation.errors).map((index) => ({
        index,
        eventId: String(row.state?.events?.[index]?.id ?? ""),
        hasSharedSpace: Boolean(row.state?.events?.[index]?.sharedSpaceId),
        locked: Boolean(row.state?.events?.[index]?.locked),
        participantCount: row.state?.events?.[index]?.participantIds?.length ?? 0,
        inactiveCount: row.state?.events?.[index]?.inactiveParticipantIds?.length ?? 0,
        adminCount: row.state?.events?.[index]?.adminIds?.length ?? 0,
        expenseCount: row.state?.events?.[index]?.expenses?.length ?? 0,
        missingReferences: missingParticipantReferences(
          row.state,
          row.state?.events?.[index]
        )
      }))
    }];
  });
  const liveInvalid = invalid.filter((row) => row.live);
  const errorsByMessage = Object.entries(
    invalid.flatMap((row) => row.errors).reduce((counts, message) => {
      counts[message] = (counts[message] ?? 0) + 1;
      return counts;
    }, {})
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([message, count]) => ({ message, count }));

  console.log(JSON.stringify({
    ok: liveInvalid.length === 0,
    checkedAt: new Date().toISOString(),
    snapshots: rows.length,
    invalidSnapshots: invalid.length,
    liveInvalidSnapshots: liveInvalid.length,
    invalidByKind: invalid.reduce((counts, row) => {
      counts[row.kind] = (counts[row.kind] ?? 0) + 1;
      return counts;
    }, {}),
    errorsByMessage,
    liveInvalid
  }, null, 2));

  if (liveInvalid.length) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

function shortHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12);
}

function invalidEventIndexes(errors) {
  return [...new Set(errors.flatMap((message) => {
    const index = String(message).match(/\.events\[(\d+)\]/)?.[1];
    return index === undefined ? [] : [Number(index)];
  }))];
}

function missingParticipantReferences(state, event) {
  if (!event) return [];
  const eventParticipantIds = new Set(event.participantIds ?? []);
  const knownParticipants = new Map(
    (state?.participants ?? []).map((participant) => [participant?.id, participant])
  );
  const expenseCreators = new Set(
    (event.expenses ?? []).map((expense) => expense?.createdByParticipantId).filter(Boolean)
  );
  const references = new Set([
    ...(event.adminIds ?? []),
    event.createdByParticipantId,
    ...expenseCreators
  ].filter(Boolean));
  return [...references]
    .filter((participantId) => !eventParticipantIds.has(participantId))
    .map((participantId) => ({
      participant: shortHash(participantId),
      existsInState: knownParticipants.has(participantId),
      isCurrent: state?.currentParticipantId === participantId,
      isAdmin: (event.adminIds ?? []).includes(participantId),
      isCreator: event.createdByParticipantId === participantId,
      createdExpense: expenseCreators.has(participantId),
      kind: String(knownParticipants.get(participantId)?.kind ?? "")
    }));
}
