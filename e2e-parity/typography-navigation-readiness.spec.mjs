import { expect, test } from '@playwright/test';
import { openTypographyHome } from '../e2e/helpers/typographyReadiness.mjs';

const owner = 'qa-typography-readiness-owner';
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: 'בודק טעינה', kind: 'user' }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [], events: []
};

async function installFixture(page, request) {
  await request.post('/api/reset');
  await request.put('/api/state', { data: state });
  await page.addInitScript(({ initialState, ownerId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(initialState));
    localStorage.setItem('settle-friends-current-participant', ownerId);
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({
      participantId: ownerId, displayName: 'בודק טעינה'
    }));
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  }, { initialState: state, ownerId: owner });
}

test('geometry can begin before a nonessential image finishes loading', async ({ page, request, baseURL }) => {
  test.setTimeout(30_000);
  await installFixture(page, request);
  let releaseImage;
  let imageRequested = false;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  await page.route(`${baseURL}/__qa_held_nonessential_image`, async route => {
    imageRequested = true;
    await imageGate;
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });
  await page.route(`${baseURL}/`, async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace('</body>',
      '<img src="/__qa_held_nonessential_image" alt="" hidden></body>') });
  });

  const measured = openTypographyHome(page).then(async () => ({
    state: await page.evaluate(() => document.readyState),
    brandSize: await page.locator('.product-brand-copy strong').first()
      .evaluate(element => getComputedStyle(element).fontSize)
  }));
  let beforeImageRelease;
  let timer;
  try {
    beforeImageRelease = await Promise.race([
      measured.then(value => ({ ready: true, value })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ ready: false }), 10_000); })
    ]);
  } finally {
    clearTimeout(timer);
    releaseImage();
  }
  await measured;
  expect(imageRequested, 'the document really requested the held image').toBe(true);
  expect(beforeImageRelease.ready, 'app and font geometry must be ready before the image load event').toBe(true);
  expect(beforeImageRelease.value).toEqual({ state: 'interactive', brandSize: '17px' });
});

test('geometry waits for the actual application, not just DOMContentLoaded', async ({ page, request }) => {
  await installFixture(page, request);
  await page.route('**/src/app.mjs?*', route => route.fulfill({
    status: 200, contentType: 'text/javascript', body: 'throw new Error("synthetic app boot failure")'
  }));
  await expect(openTypographyHome(page, { readyTimeoutMs: 1_000 })).rejects.toThrow();
});
