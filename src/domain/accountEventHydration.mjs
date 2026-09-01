export const ACCOUNT_EVENT_HYDRATION_READY = "ready";
export const ACCOUNT_EVENT_HYDRATION_LOADING = "loading";
export const ACCOUNT_EVENT_HYDRATION_UNAVAILABLE = "unavailable";

export function accountEventHydrationStatus({
  authenticated = false,
  authoritative = false,
  cachedEventCount = 0,
  refreshPending = false
} = {}) {
  if (!authenticated || authoritative || Number(cachedEventCount) > 0) {
    return ACCOUNT_EVENT_HYDRATION_READY;
  }
  return refreshPending
    ? ACCOUNT_EVENT_HYDRATION_LOADING
    : ACCOUNT_EVENT_HYDRATION_UNAVAILABLE;
}

export function canRenderConfirmedEmptyAccount(status) {
  return status === ACCOUNT_EVENT_HYDRATION_READY;
}
