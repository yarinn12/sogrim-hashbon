export async function resumeAfterAccountSessionRefresh({
  refreshRuntimeConfig,
  requestResumeSync,
  reportRefreshFailure
}) {
  try {
    await refreshRuntimeConfig();
  } catch (error) {
    reportRefreshFailure(error);
  }

  // loadRuntimeConfig() reattaches the durable stored session during the
  // resume path, so a transient /api/config failure must not suppress sync.
  return requestResumeSync({ force: true, includeSecondary: false });
}
