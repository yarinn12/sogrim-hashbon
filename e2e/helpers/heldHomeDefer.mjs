// Hold only a deliberately unrelated deferred script. The application itself
// must render a fresh home before this script and DOMContentLoaded complete.
export async function holdNonessentialHomeDefer(page, baseURL) {
  const origin = new URL(baseURL).origin;
  let releaseScript;
  let requested = false;
  const gate = new Promise(resolve => { releaseScript = resolve; });
  await page.addInitScript(() => {
    window.__qaHeldHomeDomContentLoaded = false;
    document.addEventListener('DOMContentLoaded', () => {
      window.__qaHeldHomeDomContentLoaded = true;
    }, { once: true });
  });
  await page.route(`${origin}/__qa_held_home_defer.js`, async route => {
    requested = true;
    await gate;
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await page.route(url => url.origin === origin && url.pathname === '/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace('</body>',
      '<script defer src="/__qa_held_home_defer.js"></script></body>') });
  });
  return {
    get requested() { return requested; },
    release() { releaseScript(); }
  };
}
