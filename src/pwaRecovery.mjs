try {
  const registrations = await navigator.serviceWorker?.getRegistrations?.();
  await Promise.allSettled((registrations ?? []).map((registration) => registration.unregister()));
  const cacheNames = await globalThis.caches?.keys?.();
  await Promise.allSettled((cacheNames ?? []).map((name) => caches.delete(name)));
} finally {
  location.replace("/?pwa_release=356&pwa_recovered=1");
}
