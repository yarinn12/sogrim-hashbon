import { createHash } from "node:crypto";

const SIGNATURE_PATTERN =
  /<!-- production-availability-signature:([a-f0-9]+) -->/u;
const RECOVERY_STREAK_PATTERN =
  /<!-- production-availability-recovery-streak:(\d+) -->/u;
const RECOVERY_STATUS_PATTERN =
  /^Recovery verification: \d+\/\d+ consecutive successful checks\.\s*$/gmu;

export function collectFailureBoundaries(checks = []) {
  const boundaries = [];
  for (const check of checks) {
    if (check?.outcome !== "failure") continue;
    const failedLines = String(check?.log ?? "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("FAILED"));
    if (failedLines.length === 0) {
      boundaries.push(`${check.label}: unclassified failure`);
      continue;
    }
    boundaries.push(
      ...failedLines.map((line) => normalizeFailureBoundary(check.label, line))
    );
  }
  return [...new Set(boundaries)].sort();
}

export function buildIncidentSignature(boundaries) {
  return createHash("sha256")
    .update([...boundaries].sort().join("\n"))
    .digest("hex")
    .slice(0, 16);
}

export function readIncidentSignature(body) {
  return String(body ?? "").match(SIGNATURE_PATTERN)?.[1] ?? "";
}

export function classifyIncident(previousBody, boundaries) {
  const previousSignature = readIncidentSignature(previousBody);
  if (!previousSignature) return "adopted";
  return previousSignature === buildIncidentSignature(boundaries)
    ? "unchanged"
    : "changed";
}

export function buildIncidentBody(boundaries, detectedAt = new Date()) {
  const signature = buildIncidentSignature(boundaries);
  return [
    `The production monitor detected an incident at ${detectedAt.toISOString()}.`,
    "",
    "Failing boundaries:",
    ...boundaries.map((item) => `- ${item}`),
    "",
    "The monitor keeps checking, but identical failures stay quiet until the boundary changes or service recovers.",
    "",
    `<!-- production-availability-signature:${signature} -->`
  ].join("\n");
}

export function markRecoveryCheck(body, requiredChecks = 2) {
  const safeRequiredChecks = Math.max(2, Number(requiredChecks) || 2);
  const previousStreak = Number(
    String(body ?? "").match(RECOVERY_STREAK_PATTERN)?.[1] ?? 0
  );
  const streak = Math.min(previousStreak + 1, safeRequiredChecks);
  const cleanedBody = String(body ?? "")
    .replace(RECOVERY_STREAK_PATTERN, "")
    .replace(RECOVERY_STATUS_PATTERN, "")
    .trimEnd();
  return {
    streak,
    complete: streak >= safeRequiredChecks,
    body: [
      cleanedBody,
      "",
      `Recovery verification: ${streak}/${safeRequiredChecks} consecutive successful checks.`,
      `<!-- production-availability-recovery-streak:${streak} -->`
    ].join("\n")
  };
}

function normalizeFailureBoundary(label, line) {
  const value = line.replace(/^FAILED\s+/u, "").trim();
  const separatorIndex = value.indexOf(" - ");
  const rawName = separatorIndex === -1 ? value : value.slice(0, separatorIndex);
  const rawDetail = separatorIndex === -1 ? "failed" : value.slice(separatorIndex + 3);
  const name = rawName.replace(/\s+\(\d+ms\)$/u, "").trim();
  const detail = rawDetail
    .replace(/\b[0-9a-f]{40,64}\b/giu, "<hash>")
    .replace(/\b\d+ms\b/gu, "<duration>")
    .replace(/\s+/gu, " ")
    .trim();
  return `${label}: ${name} [${detail || "failed"}]`;
}
