import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const participantId = argumentValue("--participant-id");
if (!participantId.startsWith("account-")) {
  throw new Error(
    "Usage: node scripts/audit-account-identity-state-live.mjs " +
      "--participant-id <account-participant-id>"
  );
}

const ownerUserId = participantId.slice("account-".length);
const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  const rows = await sql`
    select id, state, updated_at
    from public.app_snapshots
    where snapshot_kind = 'workspace'
      and owner_user_id = ${ownerUserId}::uuid
    order by updated_at desc
  `;
  const workspaces = rows.map((row) => {
    const state = row.state ?? {};
    const interestingParticipantIds = new Set([participantId]);
    for (const event of state.events ?? []) {
      for (const link of event.participantAccountLinks ?? []) {
        interestingParticipantIds.add(link.sourceParticipantId);
        interestingParticipantIds.add(link.targetParticipantId);
      }
    }
    for (const deletion of state.deletedParticipants ?? []) {
      interestingParticipantIds.add(deletion.id);
      if (deletion.targetParticipantId) {
        interestingParticipantIds.add(deletion.targetParticipantId);
      }
    }

    return {
      snapshotId: row.id,
      updatedAt: row.updated_at,
      currentParticipantId: state.currentParticipantId,
      currentIdentityIsCorrect: state.currentParticipantId === participantId,
      participants: (state.participants ?? [])
        .filter(
          (participant) =>
            interestingParticipantIds.has(participant.id) ||
            /hgg|ניזרי|ירין/i.test(String(participant.displayName ?? ""))
        )
        .map((participant) => ({
          id: participant.id,
          displayName: participant.displayName,
          connected: Boolean(
            participant.accountLinked ||
              (participant.authProvider && participant.authSubject)
          )
        })),
      participantAccountLinks: (state.events ?? []).flatMap((event) =>
        (event.participantAccountLinks ?? []).map((link) => ({
          eventId: event.id,
          eventName: event.name,
          ...link
        }))
      ),
      deletedParticipants: (state.deletedParticipants ?? []).map((deletion) => ({
        id: deletion.id,
        targetParticipantId: deletion.targetParticipantId,
        reason: deletion.reason,
        deletedAt: deletion.deletedAt
      }))
    };
  });
  console.log(JSON.stringify({ readOnly: true, workspaces }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
