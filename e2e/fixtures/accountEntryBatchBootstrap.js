function accountEntryBatchBootstrap(options) {
  // Setup storage/native boundaries only. The real authentication module chooses
  // and renders its gate; no UI exports, availability overrides or render hooks.
  if (!sessionStorage.getItem('account-entry-batch-fixture')) {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('account-entry-batch-fixture', '1');
    if (options.session) localStorage.setItem('settle-friends-account-session', JSON.stringify(options.session));
    if (options.recovery) localStorage.setItem('settle-friends-account-recovery-session', JSON.stringify({ userId: options.session.user.id, createdAt: Date.now() }));
  }
  sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  if (options.nativeProviders) {
    globalThis.SogrimNativeRuntimeConfig = Object.freeze(options.runtimeConfig);
    globalThis.__accountEntryNativeOpened = [];
    globalThis.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        Browser: { open: async ({ url }) => globalThis.__accountEntryNativeOpened.push(url) },
        App: { addListener: async () => ({ remove() {} }), getLaunchUrl: async () => null }
      }
    };
  }
}
