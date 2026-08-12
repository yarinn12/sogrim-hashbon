const STARTUP_MARK_PREFIX = "sogrim:start:";

export function markStartupMilestone(name, performanceImpl = globalThis.performance) {
  const safeName = String(name ?? "").trim();
  if (!safeName || typeof performanceImpl?.mark !== "function") return false;

  const markName = `${STARTUP_MARK_PREFIX}${safeName}`;
  if (performanceImpl.getEntriesByName?.(markName)?.length) return false;
  performanceImpl.mark(markName);
  return true;
}

export function startupMilestoneSnapshot(performanceImpl = globalThis.performance) {
  if (typeof performanceImpl?.getEntriesByType !== "function") return {};
  return Object.fromEntries(
    performanceImpl
      .getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith(STARTUP_MARK_PREFIX))
      .map((entry) => [
        entry.name.slice(STARTUP_MARK_PREFIX.length),
        Math.round(entry.startTime)
      ])
  );
}
