const CACHE_NAME = "settle-friends-live-v23";
const CACHE_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/privacy.html",
  "/support.html",
  "/terms.html",
  "/account-deletion.html",
  "/src/app.mjs",
  "/src/data/cloudStore.mjs",
  "/src/data/demoData.mjs",
  "/src/data/localIdentity.mjs",
  "/src/data/localStore.mjs",
  "/src/domain/appActions.mjs",
  "/src/domain/cloudSpace.mjs",
  "/src/domain/eventFilters.mjs",
  "/src/domain/eventInsights.mjs",
  "/src/domain/expenseDraft.mjs",
  "/src/domain/googleAuth.mjs",
  "/src/domain/inviteLinks.mjs",
  "/src/domain/launchReadiness.mjs",
  "/src/domain/money.mjs",
  "/src/domain/permissions.mjs",
  "/src/domain/personalMemory.mjs",
  "/src/domain/qrCode.mjs",
  "/src/domain/settlement.mjs",
  "/src/domain/settlementSummary.mjs",
  "/src/domain/stateBackup.mjs",
  "/src/domain/userProfile.mjs",
  "/src/domain/validation.mjs",
  "/src/publicAdvancedWorkflowLayer.mjs",
  "/src/publicBackNavigationLayer.mjs",
  "/src/publicBrandLayer.mjs",
  "/src/publicClarityLayer.mjs",
  "/src/publicCommandIconLayer.mjs",
  "/src/publicCopyCleanupLayer.mjs",
  "/src/publicEmptyHomePolishLayer.mjs",
  "/src/publicEventLifecycleLayer.mjs",
  "/src/publicEventWorkspaceLayer.mjs",
  "/src/publicExpenseGuestLayer.mjs",
  "/src/publicExpensePayerSummaryLayer.mjs",
  "/src/publicFintechDesignLayer.mjs",
  "/src/publicFramerMotionLayer.mjs",
  "/src/publicGoogleAuthLayer.mjs",
  "/src/publicHomeButtonLayer.mjs",
  "/src/publicInlinePayerLayer.mjs",
  "/src/publicInviteFetchGuardLayer.mjs",
  "/src/publicInviteJoinFixLayer.mjs",
  "/src/publicInviteQrLayer.mjs",
  "/src/publicInviteSnapshotLayer.mjs",
  "/src/publicJoinEventLayer.mjs",
  "/src/publicMutationThrottleLayer.mjs",
  "/src/publicNameCleanup.mjs",
  "/src/publicMobileModalLayer.mjs",
  "/src/publicPersonalActionsLayer.mjs",
  "/src/publicPersonalMemoryLayer.mjs",
  "/src/publicPremiumVisualLayer.mjs",
  "/src/publicProductV1Layer.mjs",
  "/src/publicProfileContextLayer.mjs",
  "/src/publicProfileMemoryGuardLayer.mjs",
  "/src/publicProfileOverlay.mjs",
  "/src/publicVisualRefreshLayer.mjs"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
