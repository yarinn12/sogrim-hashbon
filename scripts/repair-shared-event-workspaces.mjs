import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";

import { eventShareCredentials, mergeSharedEventIntoState } from "../src/data/sharedEventStore.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const eventId = argumentValue("--event-id");
const apply = process.argv.includes("--apply");
if (!eventId) {
  throw new Error("Usage: node scripts/repair-shared-event-workspaces.mjs --event-id <id> [--apply]");
}

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    const sharedRows = await transaction`
      select id, state, updated_at
      from public.app_snapshots
      where snapshot_kind = 'shared_event'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(state -> 'events', '[]'::jsonb)
          ) as event(value)
          where event.value ->> 'id' = ${eventId}
        )
      for update
    `;
    if (sharedRows.length !== 1) {
      throw new Error(`Expected one shared snapshot for ${eventId}, found ${sharedRows.length}.`);
    }

    const sharedRow = sharedRows[0];
    const sharedEvent = sharedRow.state.events.find((event) => event.id === eventId);
    if (!sharedEvent) throw new Error("The shared event payload is missing.");

    const inviteRows = await transaction`
      select space_key
      from public.event_invite_tokens
      where event_id = ${eventId}
        and space_id = ${sharedRow.id}
      order by (revoked_at is null) desc, updated_at desc
      limit 1
    `;
    const credentials = {
      id: sharedRow.id,
      key: String(inviteRows[0]?.space_key ?? "")
    };
    if (!eventShareCredentials({
      sharedSpaceId: credentials.id,
      sharedSpaceKey: credentials.key
    })) {
      throw new Error("Shared event recovery credentials are unavailable.");
    }

    const members = await transaction`
      select user_id, participant_id, role
      from private.shared_snapshot_members
      where snapshot_id = ${sharedRow.id}
        and status = 'active'
      order by joined_at
    `;
    const memberUserIds = members.map((member) => member.user_id);
    const workspaceRows = memberUserIds.length
      ? await transaction`
          select workspace.id, workspace.owner_user_id, workspace.state, workspace.updated_at
          from public.app_snapshots as workspace
          join (
            select distinct on (owner_user_id) id
            from public.app_snapshots
            where snapshot_kind = 'workspace'
              and owner_user_id = any(${transaction.array(memberUserIds)}::uuid[])
            order by owner_user_id, updated_at desc
          ) as latest on latest.id = workspace.id
          for update of workspace
        `
      : [];
    const workspacesByOwner = new Map(
      workspaceRows.map((row) => [String(row.owner_user_id), row])
    );
    const repaired = members.map((member) => {
      const workspace = workspacesByOwner.get(String(member.user_id));
      if (!workspace) {
        throw new Error(`Active member ${member.user_id} has no account workspace.`);
      }
      const mergedState = mergeSharedEventIntoState(
        workspace.state,
        sharedRow.state,
        credentials
      );
      const nextState = {
        ...mergedState,
        currentParticipantId: member.participant_id
      };
      validateRecoveredEvent(nextState, workspace.id);
      if (
        !nextState.participants?.some(
          (participant) => participant.id === member.participant_id
        )
      ) {
        throw new Error(
          `${workspace.id} is missing its account participant ${member.participant_id}.`
        );
      }
      return {
        ...workspace,
        participantId: member.participant_id,
        role: member.role,
        nextState,
        changed: !repairStatesEqual(nextState, workspace.state)
      };
    });
    const changedRows = repaired.filter((row) => row.changed);
    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId,
      eventName: sharedEvent.name,
      sharedSnapshotId: sharedRow.id,
      activeMemberCount: members.length,
      changedWorkspaceCount: changedRows.length,
      workspaces: repaired.map((row) => ({
        snapshotId: row.id,
        participantId: row.participantId,
        role: row.role,
        changed: row.changed,
        changedPaths: row.changed
          ? changedValuePaths(row.state, row.nextState).slice(0, 20)
          : [],
        beforeCurrentParticipantId: row.state.currentParticipantId ?? null,
        afterCurrentParticipantId: row.nextState.currentParticipantId ?? null,
        beforeParticipantIds: eventParticipantIds(row.state),
        afterParticipantIds: eventParticipantIds(row.nextState),
        beforeExpenseCount: eventExpenseCount(row.state),
        afterExpenseCount: eventExpenseCount(row.nextState)
      }))
    };

    if (!apply || !changedRows.length) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup(changedRows);
    for (const row of changedRows) {
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(row.nextState)}, updated_at = pg_catalog.now()
        where id = ${row.id}
      `;
    }
    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end();
}

function validateRecoveredEvent(state, snapshotId) {
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) throw new Error(`${snapshotId} did not recover ${eventId}.`);
  const participantIds = new Set(event.participantIds ?? []);
  const validationState = {
    participants: (state.participants ?? []).filter((participant) =>
      participantIds.has(participant.id)
    ),
    groups: [],
    events: [event]
  };
  const errors = validateSharedStateFinancials(validationState, snapshotId);
  if (errors.length) throw new Error(errors.join(" "));
}

function eventExpenseCount(state) {
  return state.events?.find((event) => event.id === eventId)?.expenses?.length ?? 0;
}

function eventParticipantIds(state) {
  return state.events?.find((event) => event.id === eventId)?.participantIds ?? [];
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function repairStatesEqual(left, right) {
  return isDeepStrictEqual(
    normalizeTopLevelEntityOrder(left),
    normalizeTopLevelEntityOrder(right)
  );
}

function normalizeTopLevelEntityOrder(state) {
  const normalized = toPlainJson(state);
  for (const key of [
    "participants",
    "friendContacts",
    "groups",
    "events",
    "deletedEvents",
    "deletedParticipants"
  ]) {
    if (!Array.isArray(normalized[key])) continue;
    normalized[key].sort((left, right) =>
      String(left?.id ?? "").localeCompare(String(right?.id ?? ""))
    );
  }
  return normalized;
}

function changedValuePaths(previous, next, pathParts = []) {
  if (isDeepStrictEqual(previous, next)) return [];
  if (!isComparableObject(previous) || !isComparableObject(next)) {
    return [formatPath(pathParts)];
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].flatMap((key) =>
    changedValuePaths(previous[key], next[key], [...pathParts, key])
  );
}

function isComparableObject(value) {
  return Boolean(value) && typeof value === "object";
}

function formatPath(parts) {
  return parts.length ? parts.join(".") : "<root>";
}

async function writeBackup(rows) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `shared-event-workspaces-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        eventId,
        exportedAt: new Date().toISOString(),
        snapshots: rows.map((row) => ({
          id: row.id,
          ownerUserId: row.owner_user_id,
          updatedAt: row.updated_at,
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

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
