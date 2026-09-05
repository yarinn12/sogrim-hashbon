// HTTP 402 is used by Supabase for a temporary project restriction (for
// example, an exhausted egress quota). It does not invalidate the user's
// credentials, so keep the local session available for recovery just like a
// timeout, rate limit, or upstream outage.
const RETRY_LATER_ACCOUNT_STATUSES = new Set([402, 408, 425, 429]);

export function isTransientAccountError(error) {
  const status = Number(error?.status);
  return !status || status >= 500 || RETRY_LATER_ACCOUNT_STATUSES.has(status);
}
