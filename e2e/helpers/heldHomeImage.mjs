import { readLocalQaHtmlFresh } from './readLocalQaHtmlFresh.mjs';

export async function holdNonessentialHomeImage(page, baseURL) {
  const origin = new URL(baseURL).origin;
  let releaseImage;
  let requested = false;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });

  await page.route(`${origin}/__qa_held_nonessential_image`, async route => {
    requested = true;
    await imageGate;
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });
  await page.route(url => url.origin === origin && url.pathname === '/', async route => {
    const response = await readLocalQaHtmlFresh(baseURL, route.request().url());
    const html = response.body.toString('utf8');
    await route.fulfill({ ...response, body: html.replace('</body>',
      '<img src="/__qa_held_nonessential_image" alt="" hidden></body>') });
  });

  return {
    get requested() { return requested; },
    release() { releaseImage(); }
  };
}
