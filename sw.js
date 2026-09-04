const PWA_RELEASE = "471";
const CACHE_NAME = "settle-friends-live-v471";
const CACHE_PREFIX = "settle-friends-live-v";
const NETWORK_FIRST_TIMEOUT_MS = 6_000;
const CACHE_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/legal.css",
  "/legal.mjs",
  "/manifest.webmanifest",
  "/brand-mark.png",
  "/brand-mark-v3.png",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/app-icon-exterior-192.png",
  "/app-icon-exterior-512.png",
  "/app-icon-exterior-maskable-512.png",
  "/apple-touch-icon.png",
  "/sogrim-logo-lockup.png",
  "/sogrim-share-logo.png",
  "/sogrim-home-hero.png",
  "/assets/sogrim-heshbon-loading-loop-v2.mp4",
  "/assets/sogrim-logo-intro-poster.jpg",
  "/assets/sogrim-logo-intro-hold.jpg",
  "/assets/sign-in-with-apple-iw.png",
  "/assets/avatars/avatar-1.png",
  "/assets/avatars/avatar-2.png",
  "/assets/avatars/avatar-3.png",
  "/assets/avatars/avatar-4.png",
  "/assets/avatars/avatar-5.png",
  "/assets/avatars/avatar-6.png",
  "/privacy.html",
  "/support.html",
  "/terms.html",
  "/accessibility.html",
  "/account-deletion.html",
  "/src/app.mjs",
  "/src/accountSessionResume.mjs",
  "/src/interactionBoundary.mjs",
  "/src/imageCropper.mjs",
  "/src/pwaBootstrap.mjs",
  "/src/platformCompatibility.mjs",
  "/src/publicAppSplashLayer.mjs",
  "/src/primaryNavigation.mjs",
  "/src/publicAccessibilityLayer.mjs",
  "/src/data/accessibilityPreferences.mjs",
  "/src/data/cloudStore.mjs",
  "/src/data/versionedReadCache.mjs",
  "/src/data/cloudConflictRetry.mjs",
  "/src/data/accountAuth.mjs",
  "/src/data/adminAnalyticsStore.mjs",
  "/src/data/fetchTimeout.mjs",
  "/src/data/appFeedback.mjs",
  "/src/data/pendingInvite.mjs",
  "/src/data/demoData.mjs",
  "/src/data/localIdentity.mjs",
  "/src/data/localStore.mjs",
  "/src/data/noteSaveRollback.mjs",
  "/src/data/settingsSaveRollback.mjs",
  "/src/data/eventActivityNotifications.mjs",
  "/src/data/eventInvites.mjs",
  "/src/data/openInviteTokenStore.mjs",
  "/src/data/pendingAccountLinks.mjs",
  "/src/data/pendingEventJoins.mjs",
  "/src/data/notificationInbox.mjs",
  "/src/data/paymentReminders.mjs",
  "/src/data/productMetrics.mjs",
  "/src/data/startupMetrics.mjs",
  "/src/data/startupScheduler.mjs",
  "/src/data/pushDevices.mjs",
  "/src/data/referralStore.mjs",
  "/src/data/premiumBillingStore.mjs",
  "/src/data/friendsStore.mjs",
  "/src/data/sharedEventStore.mjs",
  "/src/domain/appActions.mjs",
  "/src/domain/adminAnalytics.mjs",
  "/src/domain/avatarPresets.mjs",
  "/src/domain/profileAvatarSync.mjs",
  "/src/domain/cloudSpace.mjs",
  "/src/domain/compactInvite.mjs",
  "/src/domain/currencies.mjs",
  "/src/domain/dateLabels.mjs",
  "/src/domain/accountEventHydration.mjs",
  "/src/domain/accountErrors.mjs",
  "/src/domain/eventFilters.mjs",
  "/src/domain/eventInsights.mjs",
  "/src/domain/eventActivityLog.mjs",
  "/src/domain/eventMembership.mjs",
  "/src/domain/eventNotes.mjs",
  "/src/domain/eventTypes.mjs",
  "/src/domain/expenseDraft.mjs",
  "/src/domain/expenseDraftMemory.mjs",
  "/src/domain/friendContacts.mjs",
  "/src/domain/groupIdentity.mjs",
  "/src/domain/quickExpenses.mjs",
  "/src/domain/googleAuth.mjs",
  "/src/domain/inviteLinks.mjs",
  "/src/domain/referralCodes.mjs",
  "/src/domain/launchReadiness.mjs",
  "/src/domain/money.mjs",
  "/src/domain/nativeDeepLinks.mjs",
  "/src/domain/notificationInboxDestination.mjs",
  "/src/domain/notificationTargets.mjs",
  "/src/domain/entitlements.mjs",
  "/src/domain/permissions.mjs",
  "/src/domain/personalMemory.mjs",
  "/src/domain/participantIdentity.mjs",
  "/src/domain/participantAccountLink.mjs",
  "/src/domain/participantRelationshipInsights.mjs",
  "/src/domain/productMetrics.mjs",
  "/src/domain/publicOrigin.mjs",
  "/src/domain/qrCode.mjs",
  "/src/domain/settlement.mjs",
  "/src/domain/settlementSummary.mjs",
  "/src/domain/sharedStateMerge.mjs",
  "/src/domain/stateBackup.mjs",
  "/src/domain/userProfile.mjs",
  "/src/domain/userNoticePolicy.mjs",
  "/src/domain/usernames.mjs",
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
  "/src/publicFontLoader.mjs",
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
  "/src/publicScrollIntentLayer.mjs",
  "/src/scrollIntent.mjs",
  "/src/publicNameCleanup.mjs",
  "/src/publicMobileModalLayer.mjs",
  "/src/publicNativeBridgeLayer.mjs",
  "/src/publicMandatoryUpdateLayer.mjs",
  "/src/publicProductMetricsLayer.mjs",
  "/src/publicReferralRewardsLayer.mjs",
  "/src/publicPremiumBillingLayer.mjs",
  "/src/publicAdLayer.mjs",
  "/src/publicNotificationLayer.mjs",
  "/src/publicPersonalActionsLayer.mjs",
  "/src/publicPersonalMemoryLayer.mjs",
  "/src/publicPremiumVisualLayer.mjs",
  "/src/publicProductV1Layer.mjs",
  "/src/publicSyncStatusLayer.mjs",
  "/src/publicStudioDesignLayer.mjs",
  "/src/publicCircleDesignLayer.mjs",
  "/src/publicLedgerWorkspaceLayer.mjs",
  "/src/publicChoicePickerLayer.mjs",
  "/src/publicDesignCoherenceLayer.mjs",
  "/src/publicDynamicTypeLayer.mjs",
  "/src/publicProfileContextLayer.mjs",
  "/src/publicProfileMemoryGuardLayer.mjs",
  "/src/publicProfileOverlay.mjs",
  "/src/publicAccountAuthLayer.mjs",
  "/src/publicVisualRefreshLayer.mjs",
  "/src/uiIcons.mjs"
];

const LAZY_MEDIA_FILES = new Set([
  "/sogrim-home-hero.png",
  "/assets/sogrim-heshbon-loading-loop-v2.mp4",
  "/assets/sogrim-logo-intro-poster.jpg",
  "/assets/sogrim-logo-intro-hold.jpg"
]);
const PRECACHE_FILES = CACHE_FILES.filter((path) => !LAZY_MEDIA_FILES.has(path));
const CRITICAL_PRECACHE_FILES = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/src/app.mjs",
  "/src/pwaBootstrap.mjs",
  "/src/platformCompatibility.mjs",
  "/src/publicAccountAuthLayer.mjs"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => precacheFreshFiles(cache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateCurrentRelease());
});

async function activateCurrentRelease() {
  const cacheNames = await caches.keys();
  const replacesPreviousRelease = cacheNames.some(
    (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
  );

  await Promise.all([
    Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ),
    self.clients.claim()
  ]);

  if (!replacesPreviousRelease) return;
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  for (const client of windowClients) {
    const clientUrl = new URL(client.url);
    if (clientUrl.origin !== self.location.origin) continue;
    try {
      const navigation = client.navigate?.(clientUrl.href);
      navigation?.catch?.(() => {});
    } catch {
      // Activation must finish even if one stale window cannot be navigated.
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (
    event.request.method !== "GET" ||
    !sameOrigin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (isPrivateInviteUrl(url)) {
    event.respondWith(fetchPrivateInvite(event.request));
    return;
  }

  if (LAZY_MEDIA_FILES.has(url.pathname)) {
    event.respondWith(fetchCachedMedia(event.request));
    return;
  }

  event.respondWith(
    networkFirstWithShellFallback(event.request, url)
  );
});

async function networkFirstWithShellFallback(request, url) {
  const response = await fetchWithNetworkTimeout(request);
  if (!response?.ok) {
    return (
      (await caches.match(request)) ??
      (request.mode === "navigate" ? await caches.match("/index.html") : null) ??
      (await caches.match(url.pathname)) ??
      response ??
      Response.error()
    );
  }

  if (
    response.status === 200 &&
    !request.headers.has("range") &&
    isExpectedAssetResponse(url.pathname, response)
  ) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch {
      // A full cache or a transient write failure must not hide a valid response.
    }
  }
  return response;
}

async function fetchWithNetworkTimeout(request) {
  const controller = new AbortController();
  let timeoutId;
  try {
    return await Promise.race([
      fetch(request, { cache: "no-store", signal: controller.signal }),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, NETWORK_FIRST_TIMEOUT_MS);
      })
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function precacheFreshFiles(cache) {
  const criticalFiles = PRECACHE_FILES.filter((path) =>
    CRITICAL_PRECACHE_FILES.has(path)
  );

  // Installing must stay short: Chromium can leave a replacement worker in
  // `installing` while a large optional cache warm-up is still running. Cache
  // the complete runnable shell here; all other same-origin assets are filled
  // by the normal fetch handler as the current app loads them.
  await Promise.all(criticalFiles.map((path) => precacheFreshFile(cache, path)));
}

async function precacheFreshFile(cache, path) {
  const url = new URL(path, self.location.origin);
  url.searchParams.set("pwa_release", PWA_RELEASE);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !isExpectedAssetResponse(path, response)) {
    throw new Error(`Precache failed: ${path}`);
  }
  await cache.put(path, response);
}

function isExpectedAssetResponse(path, response) {
  const contentType = String(response.headers?.get?.("content-type") ?? "")
    .toLowerCase();
  if (/\.(?:mjs|js)$/.test(path)) {
    return contentType.includes("javascript");
  }
  if (path.endsWith(".css")) return contentType.includes("text/css");
  if (path.endsWith(".webmanifest")) {
    return contentType.includes("json") || contentType.includes("manifest");
  }
  if (/\.(?:png|jpg|jpeg|webp|svg)$/.test(path)) {
    return contentType.startsWith("image/");
  }
  if (path.endsWith(".mp4")) return contentType.startsWith("video/");
  if (path === "/" || path.endsWith(".html")) {
    return contentType.includes("text/html");
  }
  return true;
}

async function fetchCachedMedia(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    const requestPath = new URL(request.url).pathname;
    if (
      response.status === 200 &&
      !request.headers.has("range") &&
      isExpectedAssetResponse(requestPath, response)
    ) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      } catch {
        // A cache write failure must not block the media response.
      }
    }
    return response;
  } catch {
    return Response.error();
  }
}

function isPrivateInviteUrl(url) {
  return (
    url.searchParams.has("t") ||
    url.searchParams.has("key") ||
    url.searchParams.has("invite") ||
    url.searchParams.has("friend") ||
    url.searchParams.has("ref") ||
    url.pathname.startsWith("/r/") ||
    /^\/i\/[^/]+\/[^/]+\/[^/]+\/?$/.test(url.pathname)
  );
}

async function fetchPrivateInvite(request) {
  const response = await fetchWithNetworkTimeout(request);
  return response?.ok
    ? response
    : (await caches.match("/index.html")) ?? response ?? Response.error();
}
