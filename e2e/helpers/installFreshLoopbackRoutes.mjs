// Routing keeps state-driven journeys on fresh local responses. Playwright
// disables its HTTP cache when routing is enabled; cache-specific suites retain
// their own transport and do not use this fixture.
export async function installFreshLoopbackRoutes(page, baseURL) {
  const base = new URL(baseURL);
  if (base.protocol !== 'http:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
    throw new Error('Fresh QA requests require a local loopback root');
  }
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base.origin && !url.username && !url.password
      ? route.continue()
      : route.abort('blockedbyclient');
  });
}
