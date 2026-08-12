export function normalizeGroupName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("he-IL");
}

export function groupsHaveSameDefinition(left, right) {
  const leftName = normalizeGroupName(left?.name);
  const rightName = normalizeGroupName(right?.name);
  if (!leftName || leftName !== rightName) return false;

  const leftMembers = normalizedMemberIds(left?.memberIds);
  const rightMembers = normalizedMemberIds(right?.memberIds);
  return (
    leftMembers.length === rightMembers.length &&
    leftMembers.every((memberId, index) => memberId === rightMembers[index])
  );
}

export function findMatchingActiveGroup(
  groups,
  candidate,
  { excludeId = "" } = {}
) {
  return (Array.isArray(groups) ? groups : []).find(
    (group) =>
      group?.archived !== true &&
      group?.id !== excludeId &&
      groupsHaveSameDefinition(group, candidate)
  );
}

function normalizedMemberIds(memberIds) {
  return [
    ...new Set(
      (Array.isArray(memberIds) ? memberIds : [])
        .map((memberId) => String(memberId ?? "").trim())
        .filter(Boolean)
    )
  ].sort();
}
