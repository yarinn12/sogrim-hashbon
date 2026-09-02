const RETRY_LATER_ACCOUNT_STATUSES = new Set([408, 425, 429]);

export function isTransientAccountError(error) {
  const status = Number(error?.status);
  return !status || status >= 500 || RETRY_LATER_ACCOUNT_STATUSES.has(status);
}
