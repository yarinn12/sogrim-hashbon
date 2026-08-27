import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

import postgres from "postgres";

import {
  buildSharedEventState,
  eventShareCredentials,
  mergeSharedEventIntoState
} from "../src/data/sharedEventStore.mjs";
import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const EVENT_IDS = [
  "event-1786907446098-7bd015d4774168",
  "event-1787756211792-c38050725b15e8"
];
const OWNER_USERNAME = "yarinn12";
const TARGET_USERNAME = "nizri1";
const apply = process.argv.includes("--apply");

const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  await sql.begin(async (transaction) => {
    const accounts = await transaction`
      select user_id, username, display_name
      from public.user_profiles
      where username = any(${transaction.array([
        OWNER_USERNAME,
        TARGET_USERNAME
      ])}::text[])
      order by username
    `;
    const owner = accounts.find((account) => account.username === OWNER_USERNAME);
    const target = accounts.find((account) => account.username === TARGET_USERNAME);
    if (!owner || !target) throw new Error("The owner or target account was not found.");

    const friendship = await transaction`
      select id, status
      from public.friendships
      where user_low = least(${owner.user_id}::uuid, ${target.user_id}::uuid)
        and user_high = greatest(${owner.user_id}::uuid, ${target.user_id}::uuid)
      limit 1
    `;
    if (friendship[0]?.status !== "accepted") {
      throw new Error("The accounts do not have an accepted friendship.");
    }

    const workspaceRows = await transaction`
      select workspace.id, workspace.owner_user_id, workspace.state, workspace.updated_at
      from public.app_snapshots as workspace
      join (
        select distinct on (owner_user_id) id
        from public.app_snapshots
        where snapshot_kind = 'workspace'
          and owner_user_id = any(${transaction.array([
            owner.user_id,
            target.user_id
          ])}::uuid[])
        order by owner_user_id, updated_at desc
      ) as latest on latest.id = workspace.id
      for update of workspace
    `;
    const ownerWorkspace = workspaceRows.find(
      (row) => String(row.owner_user_id) === String(owner.user_id)
    );
    const targetWorkspace = workspaceRows.find(
      (row) => String(row.owner_user_id) === String(target.user_id)
    );
    if (!ownerWorkspace || !targetWorkspace) {
      throw new Error("The owner or target account workspace was not found.");
    }

    let nextOwnerState = clone(ownerWorkspace.state);
    let nextTargetState = clone(targetWorkspace.state);
    const plannedEvents = [];
    const sharedBackups = [];
    const membershipBackups = [];

    for (const eventId of EVENT_IDS) {
      let ownerEvent = nextOwnerState.events?.find((event) => event.id === eventId);
      if (!ownerEvent) throw new Error(`Owner workspace is missing ${eventId}.`);
      if (ownerEvent.name !== "קוריאה") {
        throw new Error(`${eventId} has the unexpected name ${ownerEvent.name}.`);
      }

      const ownerParticipantId = `account-${owner.user_id}`;
      const targetParticipantId = `account-${target.user_id}`;
      const inactiveIds = new Set(ownerEvent.inactiveParticipantIds ?? []);
      for (const participantId of [ownerParticipantId, targetParticipantId]) {
        if (!ownerEvent.participantIds?.includes(participantId) || inactiveIds.has(participantId)) {
          throw new Error(`${participantId} is not active in ${eventId}.`);
        }
      }
      if (ownerEvent.locked === true || ownerEvent.closedAt) {
        throw new Error(`${eventId} is closed and cannot be repaired as an active invitation.`);
      }

      const sharedRows = await transaction`
        select id, state, access_key_hash, updated_at
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
      if (sharedRows.length > 1) {
        throw new Error(`Multiple shared snapshots exist for ${eventId}.`);
      }

      const createsSharedSnapshot = sharedRows.length === 0;
      let credentials = eventShareCredentials(ownerEvent);
      if (!credentials && !createsSharedSnapshot) {
        const inviteRows = await transaction`
          select space_key
          from public.event_invite_tokens
          where event_id = ${eventId}
            and space_id = ${sharedRows[0].id}
          order by (revoked_at is null) desc, updated_at desc
          limit 1
        `;
        const key = String(inviteRows[0]?.space_key ?? "");
        credentials = key ? { id: sharedRows[0].id, key } : null;
      }
      if (!credentials && createsSharedSnapshot) {
        credentials = {
          id: `space-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`,
          key: randomBytes(32).toString("base64url")
        };
      }
      if (!credentials) throw new Error(`Recovery credentials are missing for ${eventId}.`);
      if (!createsSharedSnapshot && credentials.id !== sharedRows[0].id) {
        throw new Error(`Workspace credentials do not match ${eventId}.`);
      }

      if (!eventShareCredentials(ownerEvent)) {
        nextOwnerState = {
          ...nextOwnerState,
          events: nextOwnerState.events.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  sharedSpaceId: credentials.id,
                  sharedSpaceKey: credentials.key
                }
              : event
          )
        };
        ownerEvent = nextOwnerState.events.find((event) => event.id === eventId);
      }

      const sharedState = createsSharedSnapshot
        ? buildSharedEventState(nextOwnerState, eventId)
        : clone(sharedRows[0].state);
      validateEventState(sharedState, eventId, credentials.id);

      const currentMemberships = createsSharedSnapshot
        ? []
        : await transaction`
            select snapshot_id, user_id, participant_id, role, status,
                   joined_at, removed_at, updated_at, pending_join_until
            from private.shared_snapshot_members
            where snapshot_id = ${credentials.id}
              and user_id = any(${transaction.array([
                owner.user_id,
                target.user_id
              ])}::uuid[])
            order by user_id
            for update
          `;
      const removedTarget = currentMemberships.find(
        (member) =>
          String(member.user_id) === String(target.user_id) &&
          member.status === "removed"
      );
      if (removedTarget) {
        throw new Error(`${TARGET_USERNAME} was explicitly removed from ${eventId}.`);
      }

      sharedBackups.push(...sharedRows);
      membershipBackups.push(...currentMemberships);
      nextTargetState = {
        ...mergeSharedEventIntoState(nextTargetState, sharedState, credentials),
        currentParticipantId: targetParticipantId
      };
      validateWorkspaceEvent(nextTargetState, eventId, targetParticipantId);

      plannedEvents.push({
        eventId,
        eventName: ownerEvent.name,
        sharedSnapshotId: credentials.id,
        createsSharedSnapshot,
        targetMembershipBefore:
          currentMemberships.find(
            (member) => String(member.user_id) === String(target.user_id)
          )?.status ?? "missing",
        targetWorkspaceHadEvent: Boolean(
          targetWorkspace.state.events?.some((event) => event.id === eventId)
        ),
        participantCount: sharedState.events[0].participantIds?.length ?? 0,
        expenseCount: sharedState.events[0].expenses?.length ?? 0,
        transferCount: sharedState.events[0].transfers?.length ?? 0,
        paidTransferActors: (sharedState.events[0].transfers ?? [])
          .filter((transfer) => transfer.status === "paid")
          .map((transfer) => ({
            transferId: transfer.id,
            markedPaidByParticipantId: transfer.markedPaidByParticipantId ?? null
          })),
        paidStatusActors: (sharedState.events[0].transferStatusUpdates ?? [])
          .filter((status) => status.status === "paid")
          .map((status) => ({
            transferId: status.transferId,
            markedPaidByParticipantId: status.markedPaidByParticipantId ?? null
          })),
        credentials,
        sharedState,
        ownerParticipantId,
        targetParticipantId,
        ownerRole: eventAdminIds(sharedState.events[0]).includes(ownerParticipantId)
          ? "admin"
          : "member",
        targetRole: eventAdminIds(sharedState.events[0]).includes(targetParticipantId)
          ? "admin"
          : "member"
      });
    }

    const report = {
      mode: apply ? "apply" : "dry-run",
      owner: { username: owner.username, displayName: owner.display_name },
      target: { username: target.username, displayName: target.display_name },
      events: plannedEvents.map(({ credentials: _credentials, sharedState: _state, ...event }) => event),
      ownerWorkspaceChanges: changedValuePaths(ownerWorkspace.state, nextOwnerState).slice(0, 30),
      targetWorkspaceChanges: changedValuePaths(targetWorkspace.state, nextTargetState).slice(0, 30)
    };

    if (!apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const backupPath = await writeBackup({
      ownerWorkspace,
      targetWorkspace,
      sharedBackups,
      membershipBackups
    });

    await transaction`
      select pg_catalog.set_config(
        'request.jwt.claim.sub',
        ${String(owner.user_id)},
        true
      )
    `;
    for (const event of plannedEvents) {
      if (event.createsSharedSnapshot) {
        await transaction`
          insert into public.app_snapshots (
            id, access_key_hash, owner_user_id, snapshot_kind, state, updated_at
          ) values (
            ${event.sharedSnapshotId},
            ${createHash("sha256").update(event.credentials.key).digest("hex")},
            null,
            'shared_event',
            ${transaction.json(event.sharedState)},
            pg_catalog.clock_timestamp()
          )
        `;
      }

      for (const member of [
        {
          userId: owner.user_id,
          participantId: event.ownerParticipantId,
          role: event.ownerRole,
          pending: false
        },
        {
          userId: target.user_id,
          participantId: event.targetParticipantId,
          role: event.targetRole,
          pending: true
        }
      ]) {
        await transaction`
          insert into private.shared_snapshot_members (
            snapshot_id, user_id, participant_id, role, status,
            removed_at, updated_at, pending_join_until
          ) values (
            ${event.sharedSnapshotId}, ${member.userId}::uuid,
            ${member.participantId}, ${member.role}, 'active', null,
            pg_catalog.clock_timestamp(),
            ${member.pending
              ? transaction`pg_catalog.clock_timestamp() + interval '10 minutes'`
              : null}
          )
          on conflict (snapshot_id, user_id) do update
          set participant_id = excluded.participant_id,
              role = excluded.role,
              status = 'active',
              removed_at = null,
              updated_at = pg_catalog.clock_timestamp(),
              pending_join_until = excluded.pending_join_until
        `;
      }
    }

    if (!isDeepStrictEqual(ownerWorkspace.state, nextOwnerState)) {
      await transaction`
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${String(owner.user_id)},
          true
        )
      `;
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(nextOwnerState)},
            updated_at = pg_catalog.clock_timestamp()
        where id = ${ownerWorkspace.id}
      `;
    }
    if (!isDeepStrictEqual(targetWorkspace.state, nextTargetState)) {
      await transaction`
        select pg_catalog.set_config(
          'request.jwt.claim.sub',
          ${String(target.user_id)},
          true
        )
      `;
      await transaction`
        update public.app_snapshots
        set state = ${transaction.json(nextTargetState)},
            updated_at = pg_catalog.clock_timestamp()
        where id = ${targetWorkspace.id}
      `;
    }

    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
  });
} finally {
  await sql.end();
}

function validateEventState(sharedState, eventId, snapshotId) {
  const event = sharedState?.events?.find((item) => item.id === eventId);
  if (!event) throw new Error(`${snapshotId} is missing ${eventId}.`);
  const errors = validateSharedStateFinancials(sharedState, snapshotId);
  if (errors.length) throw new Error(errors.join(" "));
}

function validateWorkspaceEvent(state, eventId, participantId) {
  const event = state.events?.find((item) => item.id === eventId);
  if (!event) throw new Error(`Target workspace did not recover ${eventId}.`);
  if (!event.participantIds?.includes(participantId)) {
    throw new Error(`Target account is missing from ${eventId}.`);
  }
  validateEventState(
    buildSharedEventState(state, eventId),
    eventId,
    `workspace:${participantId}`
  );
}

function eventAdminIds(event) {
  return event.adminIds?.length
    ? event.adminIds
    : [event.createdByParticipantId].filter(Boolean);
}

async function writeBackup({
  ownerWorkspace,
  targetWorkspace,
  sharedBackups,
  membershipBackups
}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.resolve(
    "downloads",
    `korea-nizri-access-backup-${timestamp}.json`
  );
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        workspaces: [ownerWorkspace, targetWorkspace],
        sharedSnapshots: sharedBackups,
        memberships: membershipBackups
      },
      null,
      2
    ),
    "utf8"
  );
  return backupPath;
}

function changedValuePaths(previous, next, parts = []) {
  if (isDeepStrictEqual(previous, next)) return [];
  if (!isObject(previous) || !isObject(next)) {
    return [parts.length ? parts.join(".") : "<root>"];
  }
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].flatMap((key) =>
    changedValuePaths(previous[key], next[key], [...parts, key])
  );
}

function isObject(value) {
  return Boolean(value) && typeof value === "object";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
