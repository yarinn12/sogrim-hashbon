import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";
import {
  reconcileSettlementTransfers,
  settlementOptionsForEvent
} from "../src/domain/settlement.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventName = argumentValue("--name");
if (!eventName) {
  throw new Error("Usage: node scripts/audit-event-settlement-by-name.mjs --name <event-name>");
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
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(state -> 'events', '[]'::jsonb)
        ) as event(value)
        where event.value ->> 'name' = ${eventName}
      )
    order by updated_at desc
  `;

  const audits = rows.map((row) => auditRow(row, eventName));
  console.log(JSON.stringify({ readOnly: true, matches: audits.length, audits }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}

function auditRow(row, name) {
  const event = row.state.events.find((item) => item.name === name);
  const participantIds = new Set(event.participantIds ?? []);
  const participants = (row.state.participants ?? []).filter((participant) =>
    participantIds.has(participant.id)
  );
  const names = new Map(
    participants.map((participant) => [participant.id, participant.displayName])
  );
  const route = (transfer) => ({
    id: transfer.id,
    from: names.get(transfer.fromParticipantId) ?? transfer.fromParticipantId,
    to: names.get(transfer.toParticipantId) ?? transfer.toParticipantId,
    amount: transfer.amount,
    status: transfer.status ?? "pending",
    statusUpdatedAt: transfer.statusUpdatedAt ?? null
  });
  const calculate = (directSettlementTransfers) =>
    reconcileSettlementTransfers(
      participants,
      event.expenses ?? [],
      event.transfers ?? [],
      settlementOptionsForEvent({ ...event, directSettlementTransfers })
    );
  const optimized = calculate(false);
  const direct = calculate(true);

  return {
    snapshotId: row.id,
    eventId: event.id,
    updatedAt: row.updated_at,
    selectedMode: event.directSettlementTransfers ? "direct" : "optimized",
    participants: participants.map((participant) => ({
      id: participant.id,
      name: participant.displayName,
      active: !(event.inactiveParticipantIds ?? []).includes(participant.id)
    })),
    expenses: (event.expenses ?? []).map((expense) => ({
      id: expense.id,
      name: expense.name,
      total: expense.total,
      payers: (expense.payers ?? []).map((payer) => ({
        name: names.get(payer.participantId) ?? payer.participantId,
        amount: payer.amount
      })),
      sharedBy: (expense.sharedByParticipantIds ?? []).map(
        (id) => names.get(id) ?? id
      )
    })),
    storedTransfers: (event.transfers ?? []).map(route),
    transferStatusUpdates: event.transferStatusUpdates ?? [],
    optimized: {
      issues: optimized.issues,
      transfers: optimized.transfers.map(route)
    },
    direct: {
      issues: direct.issues,
      transfers: direct.transfers.map(route)
    }
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
