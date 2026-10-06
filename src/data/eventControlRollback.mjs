import { jsonValuesEqual as equal } from "./localIdentity.mjs";
import { reconcileSettlementTransfers, settlementOptionsForEvent } from "../domain/settlement.mjs";
import { mergeEventActivityLogs } from "../domain/eventActivityLog.mjs";
import { participantPairIncludes } from "../domain/participantIdentity.mjs";

const lifecycle = ["locked", "closedAt", "statusUpdatedAt"];
const admins = ["adminIds", "adminIdsScopedToEvent", "adminIdsUpdatedAt"];
const membership = ["participantIds", "inactiveParticipantIds", "membershipUpdatedAt", "membershipUpdatedAtByParticipant",
  "participantAliases", "distinctParticipantPairs"];
const fields = [...lifecycle, ...admins, ...membership, "settingsUpdatedAt", "transfers", "activityLog"];
const membershipClock = (event, id) => event.membershipUpdatedAtByParticipant?.[id] ?? event.membershipUpdatedAt ?? event.createdAt;
const copyField = (target, previous, field) => {
  if (Object.hasOwn(previous, field)) target[field] = structuredClone(previous[field]);
  else delete target[field];
};
const members = (event, field) => event[field] ?? [];

// Undo a rejected event control write in the newest snapshot. Reads from other
// devices do not advance the local save generation, so generation alone cannot
// authorize replacing the entire state. Clocks and values identify ownership.
// A mixed expense/note/profile/payment mutation is deliberately not classified.
export function rollbackEventControlStateChange(latest, previous, attempted) {
  if (!latest || !previous || !attempted || !equal(withoutControls(previous), withoutControls(attempted))) return null;
  const beforeEvents = new Map((previous.events ?? []).map(event => [event.id, event]));
  const changes = [];
  for (const after of attempted.events ?? []) {
    const before = beforeEvents.get(after.id);
    if (!before || !validControlChange(before, after, attempted.participants)) return null;
    if (!equal(before, after)) changes.push({ before, after });
  }
  if (!changes.length) return null;
  if (latest.currentParticipantId !== previous.currentParticipantId) return latest;
  const byId = new Map(changes.map(change => [change.after.id, change]));
  const deleted = new Set((latest.deletedEvents ?? []).map(event => event.id));
  return { ...latest, events: (latest.events ?? []).map(event => {
    const change = byId.get(event.id);
    return change && !deleted.has(event.id) ? undoEvent(event, change.before, change.after, latest.participants) : event;
  }) };
}

function withoutControls(state) {
  return { ...state, events: (state.events ?? []).map(event => {
    const remaining = { ...event };
    for (const field of fields) delete remaining[field];
    return remaining;
  }) };
}

function changedMembers(before, after) {
  const ids = new Set([...members(before, "participantIds"), ...members(after, "participantIds"),
    ...Object.keys(before.membershipUpdatedAtByParticipant ?? {}), ...Object.keys(after.membershipUpdatedAtByParticipant ?? {})]);
  return [...ids].filter(id => before.membershipUpdatedAtByParticipant?.[id] !== after.membershipUpdatedAtByParticipant?.[id] ||
    ["participantIds", "inactiveParticipantIds"].some(field => members(before, field).includes(id) !== members(after, field).includes(id)));
}

function validControlChange(before, after, participants) {
  const memberIds = changedMembers(before, after);
  const statusChanged = lifecycle.some(field => !equal(before[field], after[field]));
  const adminChanged = admins.some(field => !equal(before[field], after[field]));
  if (!statusChanged && !adminChanged && !memberIds.length) return equal(before, after);
  if (!memberIds.length && membership.some(field => !equal(before[field], after[field]))) return false;
  const aliases = new Set([...Object.keys(before.participantAliases ?? {}), ...Object.keys(after.participantAliases ?? {})]);
  if ([...aliases].some(id => !equal(before.participantAliases?.[id], after.participantAliases?.[id]) &&
      (!memberIds.includes(id) || after.participantAliases?.[id] !== undefined))) return false;
  const pairs = new Set([...members(before, "distinctParticipantPairs"), ...members(after, "distinctParticipantPairs")]);
  if ([...pairs].some(pair => members(before, "distinctParticipantPairs").includes(pair) !== members(after, "distinctParticipantPairs").includes(pair) &&
      (members(after, "distinctParticipantPairs").includes(pair) || !memberIds.some(id => participantPairIncludes(pair, id))))) return false;
  // Closure may materialize pending transfers. It cannot absorb a separate
  // payment-status edit, even when that edit happened in the same snapshot.
  if (!equal(before.transfers, after.transfers)) {
    if (!statusChanged || !Array.isArray(participants) || !Array.isArray(after.participantIds) || !Array.isArray(after.expenses)) return false;
    const result = reconcileSettlementTransfers(participants.filter(person => after.participantIds.includes(person.id)),
      after.expenses, before.transfers ?? [], settlementOptionsForEvent(after));
    if (result.issues.length || !equal(result.transfers, after.transfers)) return false;
  }
  const oldActivity = new Map((before.activityLog ?? []).map(entry => [entry.id, entry]));
  const allowedKinds = new Set([...(statusChanged ? ["event-closed", "event-reopened"] : []),
    ...(memberIds.length ? ["participant-added", "participant-removed", "participant-restored", "participant-left"] : [])]);
  return (after.activityLog ?? []).every(entry => oldActivity.has(entry.id)
    ? equal(entry, oldActivity.get(entry.id)) : allowedKinds.has(entry.kind));
}

function restoreGroup(next, before, after, fields) {
  if (!fields.every(field => equal(next[field], after[field]))) return false;
  for (const field of fields) copyField(next, before, field);
  return true;
}

function undoEvent(current, before, after, participants) {
  const next = { ...current };
  if (lifecycle.some(field => !equal(before[field], after[field])) && restoreGroup(next, before, after, lifecycle)) {
    if (!equal(before.transfers, after.transfers)) {
      if (equal(current.transfers, after.transfers) && equal(current.expenses, before.expenses) &&
          equal(current.participantIds, before.participantIds)) copyField(next, before, "transfers");
      else {
        const result = reconcileSettlementTransfers((participants ?? []).filter(person => next.participantIds.includes(person.id)),
          next.expenses, [...(current.transfers ?? []).filter(row => row.status === "paid"),
            ...(before.transfers ?? []).filter(row => row.status !== "paid")], settlementOptionsForEvent(next));
        if (!result.issues.length) next.transfers = result.transfers;
      }
    }
  }
  const adminsRestored = admins.some(field => !equal(before[field], after[field])) && restoreGroup(next, before, after, admins);
  if (adminsRestored && equal(current.settingsUpdatedAt, after.settingsUpdatedAt)) copyField(next, before, "settingsUpdatedAt");
  const restoredIds = [];
  for (const id of changedMembers(before, after)) {
    if (membershipClock(current, id) !== membershipClock(after, id) ||
        ["participantIds", "inactiveParticipantIds"].some(field => members(current, field).includes(id) !== members(after, field).includes(id))) continue;
    restoredIds.push(id);
    for (const field of ["participantIds", "inactiveParticipantIds"]) {
      const values = members(next, field);
      if (members(before, field).includes(id)) {
        if (!values.includes(id)) next[field] = [...values, id];
      } else if (values.includes(id)) next[field] = values.filter(value => value !== id);
    }
    next.membershipUpdatedAtByParticipant = { ...(next.membershipUpdatedAtByParticipant ?? {}) };
    const oldClock = membershipClock(before, id);
    if (oldClock) next.membershipUpdatedAtByParticipant[id] = oldClock;
    else delete next.membershipUpdatedAtByParticipant[id];
    if (equal(current.participantAliases?.[id], after.participantAliases?.[id])) {
      const aliases = { ...(next.participantAliases ?? {}) };
      copyField(aliases, before.participantAliases ?? {}, id);
      if (Object.keys(aliases).length || Object.hasOwn(before, "participantAliases")) next.participantAliases = aliases;
    }
  }
  if (restoredIds.length) {
    if (equal(current.membershipUpdatedAt, after.membershipUpdatedAt)) copyField(next, before, "membershipUpdatedAt");
    // Only restore pairs removed by this request; keep new remote pairs.
    const removed = members(before, "distinctParticipantPairs").filter(pair => !members(after, "distinctParticipantPairs").includes(pair));
    if (removed.length && restoredIds.length === changedMembers(before, after).length) {
      next.distinctParticipantPairs = [...new Set([...members(next, "distinctParticipantPairs"), ...removed])];
    }
  }
  if (!equal(before.activityLog, after.activityLog)) {
    const oldIds = new Set((before.activityLog ?? []).map(entry => entry.id));
    const rejected = new Map((after.activityLog ?? []).filter(entry => !oldIds.has(entry.id)).map(entry => [entry.id, entry]));
    const retained = (current.activityLog ?? []).filter(entry => !equal(entry, rejected.get(entry.id)));
    next.activityLog = mergeEventActivityLogs(before.activityLog, retained);
  }
  return next;
}
