const PWA_RELEASE = "372";
const SERVICE_WORKER_URL = `/sw.js?pwa_release=${PWA_RELEASE}`;

try {
  const registrations = await navigator.serviceWorker?.getRegistrations?.();
  await Promise.allSettled((registrations ?? []).map((registration) => registration.unregister()));
  const cacheNames = await globalThis.caches?.keys?.();
  await Promise.allSettled((cacheNames ?? []).map((name) => caches.delete(name)));

  const registration = await navigator.serviceWorker?.register?.(SERVICE_WORKER_URL, {
    scope: "/",
    updateViaCache: "none"
  });
  await registration?.update?.();
  await waitForCurrentWorker();
} finally {
  location.replace(`/?pwa_release=${PWA_RELEASE}&pwa_recovered=1`);
}

async function waitForCurrentWorker() {
  if (!navigator.serviceWorker) return;
  if (navigator.serviceWorker.controller?.scriptURL.includes(`pwa_release=${PWA_RELEASE}`)) return;

  await Promise.race([
    new Promise((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
    }),
    new Promise((resolve) => setTimeout(resolve, 8_000))
  ]);
}
