import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import postgres from "postgres";

import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const EVENT_ID = "event-1786907446098-7bd015d4774168";
const EVENT_NAME = "קוריאה";
const EXPECTED_OWNER_USERNAME = "yarinn12";
const EXPECTED_CREATED_DAY = "2026-08-16";
const apply = process.argv.includes("--apply");

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const embeddedCreatedAt = new Date(Number(EVENT_ID.split("-")[1])).toISOString();
if (!embeddedCreatedAt.startsWith(EXPECTED_CREATED_DAY)) {
  throw new Error("The target event id does not belong to the expected day.");
}

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
          where event.value ->> 'id' = ${EVENT_ID}
        )
      for update
    `;
    if (sharedRows.length !== 1) {
      throw new Error(`Expected one shared snapshot for ${EVENT_ID}, found ${sharedRows.length}.`);
    }

    const sharedRow = sharedRows[0];
    const event = sharedRow.state.events?.find((item) => item.id === EVENT_ID);
    if (!event || event.name !== EVENT_NAME) {
      throw new Error("The target event name or payload does not match.");
    }

    const ownerRows = await transaction`
      select profile.user_id, profile.username, profile.display_name
      from public.user_profiles as profile
      where profile.username = ${EXPECTED_OWNER_USERNAME}
      limit 1
    `;
    const owner = ownerRows[0];
    if (!owner) throw new Error("The expected owner account was not found.");

    const ownerParticipantId = `account-${owner.user_id}`;
    const adminIds = event.adminIds?.length
      ? event.adminIds
      : [event.createdByParticipantId].filter(Boolean);
    if (!adminIds.includes(ownerParticipantId)) {
      throw new Error("The expected owner is not an event administrator.");
    }

    const members = await transaction`
      select snapshot_id, user_id, participant_id, role, status,
             joined_at, removed_at, updated_at, pending_join_until
      from private.shared_snapshot_members
      where snapshot_id = ${sharedRow.id}
        and status = 'active'
      order by user_id
      for update
    `;
    if (!members.some((member) => String(member.user_id) === String(owner.user_id))) {
      throw new Error("The expected owner is not an active shared-event member.");
    }

    const memberUserIds = members.map((member) => member.user_id);
    const workspaceRows = await transaction`
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
    `;

    const workspacesByOwner = new Map(
      workspaceRows.map((workspace) => [String(workspace.owner_user_id), workspace])
    );
    for (const member of members) {
      if (!workspacesByOwner.has(String(member.user_id))) {
        throw new Error(`Active member ${member.user_id} has no current account workspace.`);
      }
    }

    const deletedAt = new Date().toISOString();
    const credentials = {
      ...(event.sharedSpaceId ? { sharedSpaceId: event.sharedSpaceId } : {}),
      ...(event.sharedSpaceKey ? { sharedSpaceKey: event.sharedSpaceKey } : {})
    };
    if (credentials.sharedSpaceId && credentials.sharedSpaceId !== sharedRow.id) {
      throw new Error("The event credentials point to a different shared snapshot.");
    }

    const nextSharedState = removeEventFromState(sharedRow.state, {
      deletedAt,
      includeCredentials: false
    });
    const nextWorkspaces = workspaceRows.map((workspace) => ({
      ...workspace,
      nextState: removeEventFromState(workspace.state, {
        deletedAt,
        includeCredentials: true,
        credentials
      })
    }));

    assertDeletionState(nextSharedState, "shared event");
    for (const workspace of nextWorkspaces) {
      assertDeletionState(workspace.nextState, `workspace ${workspace.id}`);
    }
    const [deletionGuard] = await transaction`
      select private.is_safe_shared_event_deletion(
        ${transaction.json(sharedRow.state)},
        ${transaction.json(nextSharedState)},
        ${ownerParticipantId}
      ) as accepted
    `;
    if (deletionGuard?.accepted !== true) {
      throw new Error("The server deletion guard rejected the prepared payload.");
    }

    const report = {
      mode: apply ? "apply" : "dry-run",
      eventId: EVENT_ID,
      eventName: EVENT_NAME,
      embeddedCreatedAt,
      ownerUsername: owner.username,
      sharedSnapshotId: sharedRow.id,
      activeMemberCount: members.length,
      updatedWorkspaceCount: nextWorkspaces.length,
      participantCount: event.participantIds?.length ?? 0,
      expenseCount: event.expenses?.length ?? 0,
      transferCount: event.transfers?.length ?? 0,
      serverDeletionGuardAccepted: true,
      newerSameNameEventsInOwnerWorkspace: (
        nextWorkspaces.find(
          (workspace) => String(workspace.owner_user_id) === String(owner.user_id)
        )?.state.events ?? []
      )
        .filter((candidate) => candidate.name === EVENT_NAME && candidate.id !== EVENT_ID)
        .map((candidate) => candidate.id)
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const inviteRows = await transaction`
      select id, event_id, space_id, space_key, revoked_at, updated_at
      from public.event_invite_tokens
      where event_id = ${EVENT_ID}
      order by updated_at desc
      for update
    `;
    const backupPath = await writeRecoveryBackup({
      eventId: EVENT_ID,
      savedAt: new Date().toISOString(),
      owner,
      sharedRow,
      members,
      inviteRows,
      workspaceRows
    });

    await transaction`
      select pg_catalog.set_config(
        'request.jwt.claim.sub',
        ${String(owner.user_id)},
        true
      )
    `;
    await transaction`
      update public.app_snapshots
      set state = ${transaction.json(nextSharedState)}, updated_at = pg_catalog.now()
      where id = ${sharedRow.id}
    `;

    for (const workspace of nextWorkspaces) {
      await transaction`
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${String(workspace.owner_user_id)},
          true
        )
      `;
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(workspace.nextState)}, updated_at = pg_catalog.now()
        where id = ${workspace.id}
      `;
    }

    const verificationRows = await transaction`
      select id, snapshot_kind, state
      from public.app_snapshots
      where id = ${sharedRow.id}
         or id = any(${transaction.array(nextWorkspaces.map((workspace) => workspace.id))}::text[])
    `;
    for (const row of verificationRows) {
      assertDeletionState(row.state, `${row.snapshot_kind} ${row.id}`);
    }

    console.log(JSON.stringify({ ...report, backupPath, verified: true }, null, 2));
  });
} finally {
  await sql.end({ timeout: 5 });
}

function removeEventFromState(state, {
  deletedAt,
  includeCredentials,
  credentials = {}
}) {
  const sourceEvent = state.events?.find((event) => event.id === EVENT_ID);
  const tombstone = {
    id: EVENT_ID,
    deletedAt,
    ...(includeCredentials && sourceEvent?.sharedSpaceId
      ? { sharedSpaceId: sourceEvent.sharedSpaceId }
      : includeCredentials && credentials.sharedSpaceId
        ? { sharedSpaceId: credentials.sharedSpaceId }
        : {}),
    ...(includeCredentials && sourceEvent?.sharedSpaceKey
      ? { sharedSpaceKey: sourceEvent.sharedSpaceKey }
      : includeCredentials && credentials.sharedSpaceKey
        ? { sharedSpaceKey: credentials.sharedSpaceKey }
        : {})
  };

  return {
    ...state,
    ...(!includeCredentials
      ? {
          currentParticipantId: "",
          participants: [],
          groups: []
        }
      : {}),
    events: (state.events ?? []).filter((event) => event.id !== EVENT_ID),
    deletedEvents: [
      tombstone,
      ...(state.deletedEvents ?? []).filter((event) => event.id !== EVENT_ID)
    ]
  };
}

function assertDeletionState(state, label) {
  if (state.events?.some((event) => event.id === EVENT_ID)) {
    throw new Error(`${label} still contains the target event.`);
  }
  const tombstones = (state.deletedEvents ?? []).filter(
    (event) => event.id === EVENT_ID
  );
  if (tombstones.length !== 1) {
    throw new Error(`${label} does not contain exactly one deletion tombstone.`);
  }
}

async function writeRecoveryBackup(payload) {
  const directory = path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "SogrimHeshbon",
    "recovery"
  );
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(
    directory,
    `korea-2026-08-16-${Date.now()}-${randomBytes(4).toString("hex")}.json`
  );
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    flag: "wx"
  });
  return filePath;
}
