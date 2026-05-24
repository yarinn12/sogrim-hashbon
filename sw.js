const CACHE_NAME = "settle-friends-v2";
const CACHE_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/src/app.mjs",
  "/src/domain/appActions.mjs",
  "/src/domain/eventFilters.mjs",
  "/src/domain/googleAuth.mjs",
  "/src/domain/inviteLinks.mjs",
  "/src/domain/launchReadiness.mjs",
  "/src/domain/money.mjs",
  "/src/domain/permissions.mjs",
  "/src/domain/settlement.mjs",
  "/src/domain/settlementSummary.mjs",
  "/src/domain/stateBackup.mjs",
  "/src/domain/validation.mjs",
  "/src/data/cloudStore.mjs",
  "/src/data/demoData.mjs",
  "/src/data/localIdentity.mjs",
  "/src/data/localStore.mjs",
  "/src/publicGoogleAuthLayer.mjs",
  "/src/publicAdvancedWorkflowLayer.mjs"
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
