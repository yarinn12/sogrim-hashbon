import { jsonValuesEqual } from "./localIdentity.mjs";
import { rollbackEventSettingChange } from "../domain/appActions.mjs";
import { reconcileSettlementTransfers, settlementOptionsForEvent } from "../domain/settlement.mjs";

const fields = ["adminsCanEditOnly", "roundSettlementTransfers", "directSettlementTransfers", "currency", "coverImage"];
const clock = (event, field) => event.settingsFieldUpdatedAt?.[field] ?? event.settingsUpdatedAt ?? event.createdAt;

// Apply the same narrow undo to durable state BEFORE emitting the revert event.
// Only recognize setting-only writes; unrelated mutations retain their policy.
export function rollbackSettingsOnlyStateChange(latest, previous, attempted) {
  if (!latest || !previous || !attempted ||
      !jsonValuesEqual(withoutSettings(previous), withoutSettings(attempted))) return null;
  if (latest.currentParticipantId !== previous.currentParticipantId) return latest;
  const beforeEvents = new Map((previous.events ?? []).map(event => [event.id, event]));
  const deleted = new Set((latest.deletedEvents ?? []).map(event => event.id));
  const changes = [];
  for (const after of attempted.events ?? []) {
    const before = beforeEvents.get(after.id);
    if (!before) return null;
    const changed = fields.filter(field => !jsonValuesEqual(before[field], after[field]) ||
      ((Object.hasOwn(before, field) || Object.hasOwn(after, field)) && clock(before, field) !== clock(after, field)));
    if (changed.some(field => ["roundSettlementTransfers", "directSettlementTransfers"].includes(field)) &&
        (!Array.isArray(after.participantIds) || !Array.isArray(after.expenses) ||
          !Array.isArray(attempted.participants) ||
          (before.transfers !== undefined && !Array.isArray(before.transfers)) ||
          (after.transfers !== undefined && !Array.isArray(after.transfers)))) return null;
    if (!jsonValuesEqual(before.transfers, after.transfers)) {
      // Rounding/direct-settlement switches may recalculate pending transfers,
      // but this helper must never absorb an independent payment-status edit.
      if (!changed.some(field => ["roundSettlementTransfers", "directSettlementTransfers"].includes(field))) return null;
      const participants = attempted.participants.filter(person => person && after.participantIds.includes(person.id));
      const expected = reconcileSettlementTransfers(participants, after.expenses, before.transfers ?? [], settlementOptionsForEvent(after));
      if (expected.issues.length || !jsonValuesEqual(expected.transfers, after.transfers)) return null;
    }
    for (const field of changed) changes.push({ before, after, field });
  }
  if (!changes.length) return null;
  return changes.reduce((result, { before, after, field }) => deleted.has(after.id) ? result
    : rollbackEventSettingChange(result, after.id, before, after, field), latest);
}

function withoutSettings(state) {
  return { ...state, events: (state.events ?? []).map(event => {
    const remaining = { ...event };
    for (const key of [...fields, "settingsUpdatedAt", "settingsFieldUpdatedAt", "transfers"]) delete remaining[key];
    return remaining;
  }) };
}
