import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventName = argumentValue("--event-name").toLocaleLowerCase("he-IL");
const participantName = argumentValue("--participant-name").toLocaleLowerCase("he-IL");
if (!eventName && !participantName) {
  throw new Error(
    "Usage: node scripts/audit-participant-account-links-live.mjs " +
      "[--event-name <partial-name>] [--participant-name <name>]"
  );
}

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
    where snapshot_kind = 'shared_event'
    order by updated_at desc
  `;
  const matches = [];
  for (const row of rows) {
    const participants = Array.isArray(row.state?.participants)
      ? row.state.participants
      : [];
    const participantsById = new Map(
      participants.map((participant) => [participant?.id, participant])
    );
    for (const event of row.state?.events ?? []) {
      const nameMatches =
        eventName &&
        String(event?.name ?? "").toLocaleLowerCase("he-IL").includes(eventName);
      const participantMatches =
        participantName &&
        participants.some(
          (participant) =>
            String(participant?.displayName ?? "")
              .toLocaleLowerCase("he-IL")
              .trim() === participantName
        );
      if (!nameMatches && !participantMatches) continue;

      const eventParticipantIds = new Set(event.participantIds ?? []);
      matches.push({
        snapshotId: row.id,
        updatedAt: row.updated_at,
        eventId: event.id,
        eventName: event.name,
        participants: participants
          .filter((participant) => eventParticipantIds.has(participant.id))
          .map((participant) => ({
            id: participant.id,
            displayName: participant.displayName,
            connected: Boolean(
              participant.accountLinked ||
                (participant.authProvider && participant.authSubject)
            ),
            active: !(event.inactiveParticipantIds ?? []).includes(participant.id)
          })),
        participantAccountLinks: (event.participantAccountLinks ?? []).map((link) => ({
          ...link,
          sourceDisplayName:
            participantsById.get(link.sourceParticipantId)?.displayName ?? "",
          targetDisplayName:
            participantsById.get(link.targetParticipantId)?.displayName ?? ""
        })),
        relevantDeletedParticipants: (row.state?.deletedParticipants ?? [])
          .filter(
            (deletion) =>
              eventParticipantIds.has(deletion?.id) ||
              eventParticipantIds.has(deletion?.targetParticipantId) ||
              (event.participantAccountLinks ?? []).some(
                (link) =>
                  [link.sourceParticipantId, link.targetParticipantId].includes(
                    deletion?.id
                  )
              )
          )
          .map((deletion) => ({
            id: deletion.id,
            targetParticipantId: deletion.targetParticipantId,
            reason: deletion.reason,
            deletedAt: deletion.deletedAt
          }))
      });
    }
  }
  console.log(JSON.stringify({ readOnly: true, matches }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
