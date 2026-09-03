// Live QA must never print invite credentials, auth responses or note bodies.
export function summarizeLiveFailure(payload) {
  if (!payload || typeof payload !== "object") return {};
  return {
    ...(/^[A-Z][A-Z0-9_]{0,79}$/.test(payload.code ?? "") ? { code: payload.code } : {}),
    ...(["auth", "account", "invite", "snapshot", "membership"].includes(payload.stage)
      ? { stage: payload.stage } : {}),
    ...(typeof payload.retryable === "boolean" ? { retryable: payload.retryable } : {}),
    ...(Number.isInteger(payload.upstreamStatus) && payload.upstreamStatus >= 100 &&
      payload.upstreamStatus <= 599 ? { upstreamStatus: payload.upstreamStatus } : {}),
    ...(/^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(payload.upstreamCode ?? "")
      ? { upstreamCode: payload.upstreamCode } : {})
  };
}

export function summarizeLiveRequest(entry, startedAt = 0) {
  return {
    path: entry.path, method: entry.method, status: entry.status,
    startedAfterMs: Math.round((entry.startedAt - startedAt) * 10) / 10,
    headersAfterMs: Math.round((entry.headersAt - entry.startedAt) * 10) / 10,
    completedAfterMs: Number.isFinite(entry.finishedAt)
      ? Math.round((entry.finishedAt - entry.startedAt) * 10) / 10 : null,
    ...entry.failure
  };
}
