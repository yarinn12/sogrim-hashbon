export function getHealthPayload(config) {
  return {
    ok: true,
    storageMode: config.storage?.mode ?? "local",
    publicUrlReady: Boolean(config.launch?.publicUrlReady),
    cloudStorageReady: Boolean(config.launch?.cloudStorageReady),
    googleAuthReady: Boolean(config.launch?.googleAuthReady),
    accountDeletionReady: Boolean(config.launch?.accountDeletionReady),
    googlePlayBillingReady: Boolean(config.launch?.googlePlayBillingReady),
    pushDeliveryReady: Boolean(config.launch?.pushDeliveryReady),
    shareLinksReady: Boolean(config.launch?.shareLinksReady)
  };
}
