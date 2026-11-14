import { jsonValuesEqual } from './stateIdentity.mjs';

// Array ordering is not an expense edit. Preserve the authenticated snapshot's
// representation only when every record and every field still agrees. Never
// use a balance/fingerprint comparison here: it could erase a name, receipt,
// timestamp or other genuine pending edit with the same financial outcome.
function sameEntries(left, right, key, equal = jsonValuesEqual) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const leftKeys = left.map(key), rightKeys = right.map(key);
  if ([...leftKeys, ...rightKeys].some(id => typeof id !== 'string' || !id) ||
      new Set(leftKeys).size !== left.length || new Set(rightKeys).size !== right.length) return false;
  const byKey = new Map(right.map(item => [key(item), item]));
  return left.every(item => byKey.has(key(item)) && equal(item, byKey.get(key(item))));
}

function sameExpense(canonical, candidate) {
  if (jsonValuesEqual(canonical, candidate)) return true;
  if (!canonical || !candidate || typeof canonical !== 'object' || typeof candidate !== 'object') return false;
  const comparable = { ...candidate };
  // Legacy expenses can acquire an absent creator/clock with value undefined
  // during identity merging. JSON omits that property on the wire. A defined
  // canonical property is never removed by this representation-only step.
  for (const [key, value] of Object.entries(comparable)) {
    if (value === undefined && !Object.hasOwn(canonical, key)) delete comparable[key];
  }
  for (const [field, key] of [['payers', item => item?.participantId], ['sharedByParticipantIds', item => item]]) {
    if (sameEntries(canonical[field], candidate[field], key)) comparable[field] = canonical[field];
  }
  return jsonValuesEqual(canonical, comparable);
}

export function preserveCanonicalClosedExpenseOrder(candidate, canonical) {
  if (canonical?.locked !== true || candidate?.id !== canonical.id) return candidate;
  let result = candidate;
  for (const [field, equal] of [['expenses', sameExpense], ['deletedExpenses', jsonValuesEqual]]) {
    if (!jsonValuesEqual(canonical[field], candidate[field]) &&
        sameEntries(canonical[field], candidate[field], item => item?.id, equal)) {
      result = { ...result, [field]: JSON.parse(JSON.stringify(canonical[field])) };
    }
  }
  return result;
}
