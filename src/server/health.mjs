export function getHealthPayload(config, {
  requireProductionReadiness = false,
  deploymentRevision = ""
} = {}) {
  const storageMode = config.storage?.mode ?? "local";
  const publicUrlReady = Boolean(config.launch?.publicUrlReady);
  const cloudStorageReady = Boolean(config.launch?.cloudStorageReady);
  const googleAuthReady = Boolean(config.launch?.googleAuthReady);
  const authEmailDeliveryReady = Boolean(
    config.launch?.authEmailDeliveryReady
  );
  const accountDeletionReady = Boolean(config.launch?.accountDeletionReady);
  const shareLinksReady = Boolean(config.launch?.shareLinksReady);
  const productionReady =
    storageMode === "supabase" &&
    publicUrlReady &&
    cloudStorageReady &&
    googleAuthReady &&
    accountDeletionReady &&
    shareLinksReady;

  return {
    ok: requireProductionReadiness ? productionReady : true,
    ...(/^[a-f0-9]{40}$/i.test(deploymentRevision) ? { deploymentRevision } : {}),
    storageMode,
    publicUrlReady,
    cloudStorageReady,
    googleAuthReady,
    authEmailDeliveryReady,
    accountDeletionReady,
    googlePlayBillingReady: Boolean(config.launch?.googlePlayBillingReady),
    pushDeliveryReady: Boolean(config.launch?.pushDeliveryReady),
    shareLinksReady
  };
}
