const CACHE_NAME = "settle-friends-live-v147";
const CACHE_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/legal.css",
  "/manifest.webmanifest",
  "/brand-mark.png",
  "/brand-mark-v3.png",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/sogrim-logo-lockup.png",
  "/sogrim-share-logo.png",
  "/sogrim-home-hero.png",
  "/assets/sogrim-logo-intro.mp4",
  "/assets/sogrim-logo-intro-poster.jpg",
  "/privacy.html",
  "/support.html",
  "/terms.html",
  "/account-deletion.html",
  "/src/app.mjs",
  "/src/publicAppSplashLayer.mjs",
  "/src/data/cloudStore.mjs",
  "/src/data/accountAuth.mjs",
  "/src/data/pendingInvite.mjs",
  "/src/data/demoData.mjs",
  "/src/data/localIdentity.mjs",
  "/src/data/localStore.mjs",
  "/src/data/sharedEventStore.mjs",
  "/src/domain/appActions.mjs",
  "/src/domain/cloudSpace.mjs",
  "/src/domain/currencies.mjs",
  "/src/domain/dateLabels.mjs",
  "/src/domain/eventFilters.mjs",
  "/src/domain/eventInsights.mjs",
  "/src/domain/eventTypes.mjs",
  "/src/domain/expenseDraft.mjs",
  "/src/domain/expenseDraftMemory.mjs",
  "/src/domain/quickExpenses.mjs",
  "/src/domain/googleAuth.mjs",
  "/src/domain/inviteLinks.mjs",
  "/src/domain/launchReadiness.mjs",
  "/src/domain/money.mjs",
  "/src/domain/permissions.mjs",
  "/src/domain/personalMemory.mjs",
  "/src/domain/qrCode.mjs",
  "/src/domain/settlement.mjs",
  "/src/domain/settlementSummary.mjs",
  "/src/domain/sharedStateMerge.mjs",
  "/src/domain/stateBackup.mjs",
  "/src/domain/userProfile.mjs",
  "/src/domain/validation.mjs",
  "/src/publicAdvancedWorkflowLayer.mjs",
  "/src/publicBrandLayer.mjs",
  "/src/publicClarityLayer.mjs",
  "/src/publicCommandIconLayer.mjs",
  "/src/publicCopyCleanupLayer.mjs",
  "/src/publicDesignV2Layer.mjs",
  "/src/publicEmptyHomePolishLayer.mjs",
  "/src/publicEventLifecycleLayer.mjs",
  "/src/publicEventWorkspaceLayer.mjs",
  "/src/publicExpenseGuestLayer.mjs",
  "/src/publicFintechDesignLayer.mjs",
  "/src/publicFramerMotionLayer.mjs",
  "/src/vendor/framer-motion-dom.js",
  "/src/publicGoogleAuthLayer.mjs",
  "/src/publicHomeButtonLayer.mjs",
  "/src/publicInlinePayerLayer.mjs",
  "/src/publicInstallAppLayer.mjs",
  "/src/publicInviteFetchGuardLayer.mjs",
  "/src/publicInviteJoinFixLayer.mjs",
  "/src/publicInviteQrLayer.mjs",
  "/src/publicInviteSnapshotLayer.mjs",
  "/src/publicJoinEventLayer.mjs",
  "/src/publicMutationThrottleLayer.mjs",
  "/src/publicNameCleanup.mjs",
  "/src/publicMobileModalLayer.mjs",
  "/src/publicNativeBridgeLayer.mjs",
  "/src/publicPersonalActionsLayer.mjs",
  "/src/publicPersonalMemoryLayer.mjs",
  "/src/publicPremiumVisualLayer.mjs",
  "/src/publicProductV1Layer.mjs",
  "/src/publicSyncStatusLayer.mjs",
  "/src/publicStudioDesignLayer.mjs",
  "/src/publicCircleDesignLayer.mjs",
  "/src/publicLedgerWorkspaceLayer.mjs",
  "/src/publicProfileContextLayer.mjs",
  "/src/publicProfileMemoryGuardLayer.mjs",
  "/src/publicProfileOverlay.mjs",
  "/src/publicAccountAuthLayer.mjs",
  "/src/publicVisualRefreshLayer.mjs"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((names) =>
          Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
        ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.searchParams.has("key") || url.searchParams.has("invite")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return (
          (await caches.match(event.request)) ??
          (event.request.mode === "navigate" ? await caches.match("/index.html") : null) ??
          (await caches.match(url.pathname)) ??
          Response.error()
        );
      }
    })()
  );
});
