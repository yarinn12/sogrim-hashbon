import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";
import { loadEnvFile } from "../src/server/envFile.mjs";

import { validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";
import {
  EVENT_SPACE_ID_FIELD,
  EVENT_SPACE_KEY_FIELD
} from "../src/data/sharedEventStore.mjs";
import { EVENT_OPEN_INVITE_TOKEN_FIELD } from "../src/data/eventInvites.mjs";

const EVENT_ID = argumentValue("--event-id");
const INCLUDE_DETAILS = process.argv.includes("--details");
const EXPECTED_PARTICIPANT_COUNT = Number(
  argumentValue("--expected-participants") || 0
);
if (!EVENT_ID) {
  throw new Error(
    "Usage: node scripts/audit-lobby-nizri-live.mjs --event-id <id> " +
      "[--expected-participants <count>]"
  );
}

loadEnvFile(".env.local");
loadEnvFile(".env");
const env = process.env;
const databaseUrl = env.SUPABASE_DB_URL || env.DATABASE_URL || env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Missing Supabase database URL.");

const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

try {
  const snapshots = await sql`
    select id, owner_user_id, snapshot_kind, state, updated_at
    from public.app_snapshots
    where state::text like ${`%${EVENT_ID}%`}
    order by updated_at desc
  `;
  const shared = snapshots.find((row) => row.snapshot_kind === "shared_event");
  if (!shared) throw new Error("Shared event snapshot was not found.");

  const event = shared.state.events?.find((item) => item.id === EVENT_ID);
  if (!event) throw new Error("Event was not found in its shared snapshot.");

  const memberships = await sql`
    select
      member.user_id,
      member.participant_id,
      member.role,
      member.status,
      member.updated_at,
      profile.display_name,
      profile.username,
      (account.id is not null) as has_auth_user
    from private.shared_snapshot_members as member
    left join public.user_profiles as profile on profile.user_id = member.user_id
    left join auth.users as account on account.id = member.user_id
    where member.snapshot_id = ${shared.id}
    order by member.joined_at, member.user_id
  `;

  const participants = (shared.state.participants ?? []).filter((participant) =>
    event.participantIds?.includes(participant.id)
  );
  const activeMemberships = memberships.filter((member) => member.status === "active");
  const memberByParticipantId = new Map(
    activeMemberships.map((member) => [member.participant_id, member])
  );
  const workspaces = snapshots.filter((row) => row.snapshot_kind === "workspace");
  const workspaceByOwner = new Map(
    workspaces.map((row) => [String(row.owner_user_id), row])
  );
  const canonicalExpenseIds = (event.expenses ?? []).map((expense) => expense.id).sort();
  const canonicalParticipantIds = [...(event.participantIds ?? [])].sort();
  const duplicateNames = duplicateNormalizedNames(participants);
  const financialErrors = validateSharedStateFinancials(
    { participants, groups: [], events: [event] },
    shared.id
  );

  const participantAudit = participants.map((participant) => {
    const membership = memberByParticipantId.get(participant.id);
    const workspace = membership
      ? workspaceByOwner.get(String(membership.user_id))
      : null;
    const workspaceEvent = workspace?.state?.events?.find((item) => item.id === EVENT_ID);
    return {
      name: participant.displayName,
      participantId: participant.id,
      connectedIdentity: Boolean(membership?.has_auth_user),
      membershipStatus: membership?.status ?? "missing",
      role: membership?.role ?? "none",
      profileName: membership?.display_name ?? null,
      username: membership?.username ?? null,
      workspaceHasEvent: Boolean(workspaceEvent),
      workspaceCurrentParticipantId:
        workspace?.state?.currentParticipantId ?? null,
      workspaceCurrentParticipantMatches: workspace
        ? workspace.state.currentParticipantId === participant.id
        : false,
      workspaceParticipantsMatch: workspaceEvent
        ? sameValues(workspaceEvent.participantIds ?? [], canonicalParticipantIds)
        : false,
      workspaceExpensesMatch: workspaceEvent
        ? sameValues(
            (workspaceEvent.expenses ?? []).map((expense) => expense.id),
            canonicalExpenseIds
          )
        : false,
      workspaceEventMatches: workspaceEvent
        ? isDeepStrictEqual(
            comparableEvent(workspaceEvent),
            comparableEvent(event)
          )
        : false,
      workspaceEventDifferencePaths: workspaceEvent
        ? changedValuePaths(
            comparableEvent(event),
            comparableEvent(workspaceEvent)
          ).slice(0, 20)
        : [],
      ...(INCLUDE_DETAILS && workspaceEvent
        ? {
            workspaceTransfers: (workspaceEvent.transfers ?? []).map(
              (transfer) => ({
                id: transfer.id,
                fromParticipantId: transfer.fromParticipantId,
                toParticipantId: transfer.toParticipantId,
                amount: transfer.amount,
                status: transfer.status,
                statusUpdatedAt: transfer.statusUpdatedAt ?? null
              })
            )
          }
        : {}),
      workspaceUpdatedAt: workspace?.updated_at ?? null
    };
  });

  const activeMembershipWithoutParticipant = activeMemberships
    .filter((member) => !canonicalParticipantIds.includes(member.participant_id))
    .map((member) => member.participant_id);
  const staleWorkspaceCopies = participantAudit
    .filter(
      (item) =>
        item.connectedIdentity &&
        (!item.workspaceHasEvent ||
          !item.workspaceCurrentParticipantMatches ||
          !item.workspaceParticipantsMatch ||
          !item.workspaceExpensesMatch ||
          !item.workspaceEventMatches)
    )
    .map((item) => item.name);
  const disconnectedParticipants = participantAudit
    .filter((item) => !item.connectedIdentity)
    .map((item) => item.name);
  const expenseTotal = (event.expenses ?? []).reduce(
    (total, expense) => total + Number(expense.total ?? 0),
    0
  );
  const transferTotal = (event.transfers ?? []).reduce(
    (total, transfer) => total + Number(transfer.amount ?? 0),
    0
  );
  const issues = [
    ...(EXPECTED_PARTICIPANT_COUNT > 0 &&
    participants.length !== EXPECTED_PARTICIPANT_COUNT
      ? [
          `Expected ${EXPECTED_PARTICIPANT_COUNT} active participants, ` +
            `found ${participants.length}.`
        ]
      : []),
    ...(EXPECTED_PARTICIPANT_COUNT > 0 &&
    activeMemberships.length !== EXPECTED_PARTICIPANT_COUNT
      ? [
          `Expected ${EXPECTED_PARTICIPANT_COUNT} active account memberships, ` +
            `found ${activeMemberships.length}.`
        ]
      : []),
    ...(disconnectedParticipants.length
      ? [`Participants without a connected account: ${disconnectedParticipants.join(", ")}.`]
      : []),
    ...(activeMembershipWithoutParticipant.length
      ? ["Active memberships reference people outside the event."]
      : []),
    ...(duplicateNames.length
      ? [`Duplicate active names: ${duplicateNames.join(", ")}.`]
      : []),
    ...(staleWorkspaceCopies.length
      ? [`Stale or missing workspace copies: ${staleWorkspaceCopies.join(", ")}.`]
      : []),
    ...financialErrors
  ];
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    readOnly: true,
    event: {
      id: event.id,
      name: event.name,
      participants: participants.length,
      activeAccountMemberships: activeMemberships.length,
      expenses: event.expenses?.length ?? 0,
      expenseTotal,
      transfers: event.transfers?.length ?? 0,
      transferTotal,
      updatedAt: shared.updated_at
    },
    participantAudit,
    duplicateNames,
    activeMembershipWithoutParticipant,
    financialErrors,
    ...(INCLUDE_DETAILS
      ? {
          details: {
            participantIds: event.participantIds ?? [],
            inactiveParticipantIds: event.inactiveParticipantIds ?? [],
            participantAliases: event.participantAliases ?? {},
            membershipUpdatedAt: event.membershipUpdatedAt ?? null,
            membershipUpdatedAtByParticipant:
              event.membershipUpdatedAtByParticipant ?? {},
            expenses: (event.expenses ?? []).map((expense) => ({
              id: expense.id,
              name: expense.name,
              total: expense.total,
              payers: expense.payers ?? [],
              sharedByParticipantIds: expense.sharedByParticipantIds ?? [],
              updatedAt: expense.updatedAt ?? null
            })),
            transfers: (event.transfers ?? []).map((transfer) => ({
              id: transfer.id,
              fromParticipantId: transfer.fromParticipantId,
              toParticipantId: transfer.toParticipantId,
              amount: transfer.amount,
              status: transfer.status,
              updatedAt: transfer.updatedAt ?? null,
              statusUpdatedAt: transfer.statusUpdatedAt ?? null
            }))
          }
        }
      : {}),
    issues,
    healthy: issues.length === 0
  }, null, 2));
} finally {
  await sql.end();
}

function sameValues(values, expectedSorted) {
  return JSON.stringify([...values].sort()) === JSON.stringify(expectedSorted);
}

function comparableEvent(event) {
  const copy = JSON.parse(JSON.stringify(event));
  delete copy[EVENT_SPACE_ID_FIELD];
  delete copy[EVENT_SPACE_KEY_FIELD];
  delete copy[EVENT_OPEN_INVITE_TOKEN_FIELD];
  // The timestamp can legitimately differ between account workspaces even
  // when every synchronized setting value is identical.
  delete copy.settingsUpdatedAt;
  if (copy.membershipUpdatedAtByParticipant) {
    const activeParticipantIds = new Set(copy.participantIds ?? []);
    copy.membershipUpdatedAtByParticipant = Object.fromEntries(
      Object.entries(copy.membershipUpdatedAtByParticipant).filter(([id]) =>
        activeParticipantIds.has(id)
      )
    );
  }
  for (const field of [
    "participantIds",
    "inactiveParticipantIds",
    "adminIds",
    "distinctParticipantPairs"
  ]) {
    if (Array.isArray(copy[field])) copy[field].sort();
  }
  if (Array.isArray(copy.expenses)) copy.expenses.sort(byId);
  if (Array.isArray(copy.transfers)) copy.transfers.sort(byId);
  if (Array.isArray(copy.activityLog)) copy.activityLog.sort(byId);
  return copy;
}

function byId(left, right) {
  return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
}

function changedValuePaths(previous, next, pathParts = []) {
  if (isDeepStrictEqual(previous, next)) return [];
  if (!isComparableObject(previous) || !isComparableObject(next)) {
    return [pathParts.join(".") || "<root>"];
  }
  const keys = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(next ?? {})
  ]);
  return [...keys].flatMap((key) =>
    changedValuePaths(previous?.[key], next?.[key], [...pathParts, key])
  );
}

function isComparableObject(value) {
  return Boolean(value) && typeof value === "object";
}

function duplicateNormalizedNames(participants) {
  const names = new Map();
  for (const participant of participants) {
    const normalized = String(participant.displayName ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("he-IL");
    if (!normalized) continue;
    names.set(normalized, [...(names.get(normalized) ?? []), participant.displayName]);
  }
  return [...names.values()].filter((items) => items.length > 1).flat();
}

async function readEnvFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}
