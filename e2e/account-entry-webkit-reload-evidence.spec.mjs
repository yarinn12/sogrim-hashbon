import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import {
  accountEntryAuthOrigin, accountEntryEmail, expectNoExternalFailures,
  accountEntryUserId, openAccountEntry, prepareAccountEntry
} from './helpers/accountEntryBatchPresentation.mjs';

test.use({ serviceWorkers: 'block' });

test('WebKit reload mechanism: a same-origin fetch after replacement starts fails before server ingress', async ({ page }) => {
  let release, navigationStarted;
  const held = new Promise(resolve => { release = resolve; });
  const replacing = new Promise(resolve => { navigationStarted = resolve; });
  const ingress = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid');
    ingress.push(url.pathname + url.search);
    request.resume();
    if (url.pathname === '/replacement') { navigationStarted();await held; }
    response.setHeader('content-type', url.pathname === '/api' ? 'application/json' : 'text/html');
    response.end(url.pathname === '/api' ? '{"ok":true}' : '<!doctype html><title>' + url.pathname + '</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const errors = [];
  page.on('pageerror', error => errors.push({ name: error.name, message: error.message, stack: error.stack }));
  try {
    await page.goto(origin + '/initial');
    const old = await page.evaluateHandle(() => ({
      run: async query => {
        try { return { status: (await fetch('/api?' + query, { method: 'POST', body: '{}' })).status }; }
        catch (error) { return { name: error.name, message: error.message }; }
      }
    }));
    expect(await old.evaluate(value => value.run('case=control'))).toEqual({ status: 200 });
    expect(errors).toEqual([]);
    const navigation = page.goto(origin + '/replacement');
    await replacing;
    const result = await old.evaluate(value => value.run('case=replacement'));
    release();
    await navigation;
    expect(result).toMatchObject({ name: 'TypeError' });
    expect(ingress).toContain('/api?case=control');
    expect(ingress).not.toContain('/api?case=replacement');
    expect(errors).toHaveLength(1);
    expect(errors[0].stack).toContain(origin + '/api?case=replacement due to access control checks.');
    expect(await page.title()).toBe('/replacement');
  } finally {
    release();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('account entry reload evidence: an identified unissued snapshot fetch is retained as a WebKit diagnostic', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { acceptLogin: true });
  const gate = await openAccountEntry(page);
  await gate.locator('input[name=email]').fill(accountEntryEmail);
  await gate.locator('input[name=password]').fill('SyntheticOnly123!');
  const old = await page.evaluateHandle(async () => {
    const { fetchWithTimeout } = await import('/src/data/fetchTimeout.mjs');
    return { run: async url => {
      try { return { status: (await fetchWithTimeout(fetch, url)).status }; }
      catch (error) { return { name: error.name, message: error.message }; }
    } };
  });
  // The CI event followed a completed request to this same endpoint. Prove
  // the synthetic endpoint works before replacing the old document.
  const snapshotUrl = accountEntryAuthOrigin + '/rest/v1/app_snapshots?id=eq.space-account-entry&select=updated_at';
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const navigationStarted = new Promise(resolve => { started = resolve; });
  await page.route(url => url.origin === new URL(baseURL).origin && url.pathname === '/', async route => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    started();
    await held;
    await route.fallback();
  });
  let probe;
  try {
    await fixture.reloadEvidence.withExpectedReload(async () => {
      expect(await old.evaluate((value, url) => value.run(url), snapshotUrl)).toEqual({ status: 200 });
      const click = gate.getByRole('button', { name: 'התחבר', exact: true }).click();
      await navigationStarted;
      probe = await old.evaluate((value, url) => value.run(url), snapshotUrl);
      release();
      await click;
    });
  } finally { release(); }
  expect(probe).toMatchObject({ name: 'TypeError' });
  expect(fixture.reloadEvidence.reloads).toHaveLength(1);
  expect(fixture.record.pageErrors).toHaveLength(1);
  // The former fixture asserted this exact raw list was empty.
  expect(() => expect(fixture.record.pageErrors).toEqual([])).toThrow();
  expectNoExternalFailures(fixture);
  expect(fixture.record.reloadDiagnostics).toHaveLength(1);
  const diagnostic = fixture.record.reloadDiagnostics[0];
  const attempt = fixture.reloadEvidence.attempts.get(diagnostic.id);
  expect(attempt).toMatchObject({ documentId: fixture.reloadEvidence.reloads[0].oldDocumentId });
  expect(attempt.request).toBeUndefined();
  expect(attempt.response).toBeUndefined();
  expect(attempt.failure).toBeUndefined();
});

test('account recovery reload: two old-document reads are identified while the new gate and reads recover', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL,
    { recovery: true, trackRecoveryReload: true });
  const gate = await openAccountEntry(page, { mode: 'reset' });
  const old = await page.evaluateHandle(async () => {
    const { fetchWithTimeout } = await import('/src/data/fetchTimeout.mjs');
    return { run: async url => {
      try { return { status: (await fetchWithTimeout(fetch, url)).status }; }
      catch (error) { return { name: error.name, message: error.message }; }
    } };
  });
  const metadataUrl = accountEntryAuthOrigin +
    '/rest/v1/app_snapshots?id=eq.space-account-entry&select=updated_at';
  const notificationUrl = new URL(accountEntryAuthOrigin + '/rest/v1/notification_inbox');
  notificationUrl.searchParams.set('recipient_user_id', 'eq.' + accountEntryUserId);
  notificationUrl.searchParams.set('select',
    'id,event_id,activity_id,kind,title,body,view,action_url,created_at,read_at');
  notificationUrl.searchParams.set('order', 'created_at.desc');
  notificationUrl.searchParams.set('limit', '40');
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const navigationStarted = new Promise(resolve => { started = resolve; });
  await page.route(url => url.origin === new URL(baseURL).origin && url.pathname === '/', async route => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    started();
    await held;
    await route.fallback();
  });
  let probes;
  try {
    await fixture.reloadEvidence.withExpectedReload(async () => {
      const navigation = page.reload();
      await navigationStarted;
      probes = await Promise.all([
        old.evaluate((value, url) => value.run(url), notificationUrl.href),
        old.evaluate((value, url) => value.run(url), metadataUrl)
      ]);
      release();
      await navigation;
    }, { expectedFinal: 'recovery-gate' });
  } finally { release(); }
  expect(probes).toEqual([{ name: 'TypeError', message: 'Load failed' },
    { name: 'TypeError', message: 'Load failed' }]);
  await expect(gate.locator('form')).toHaveAttribute('data-mode', 'reset-password');
  expect(fixture.record.userUpdates).toEqual([]);
  expect(fixture.record.snapshotWrites).toEqual([]);
  expectNoExternalFailures(fixture);
  expect(fixture.record.reloadDiagnostics.map(item => item.reason)).toEqual([
    'webkit-unissued-recovery-notification', 'webkit-unissued-recovery-metadata'
  ]);
  for (const diagnostic of fixture.record.reloadDiagnostics) {
    const attempt = fixture.reloadEvidence.attempts.get(diagnostic.id);
    expect(attempt).toMatchObject({ documentId: fixture.reloadEvidence.reloads[0].oldDocumentId });
    expect(attempt.request).toBeUndefined();
    expect(attempt.response).toBeUndefined();
    expect(attempt.failure).toBeUndefined();
  }
});

test('account entry sign-out reload: an unissued workspace read is identified only after logout', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { authenticated: true, incompleteUsername: true });
  const gate = await openAccountEntry(page, { mode: 'complete' });
  const old = await page.evaluateHandle(async () => {
    const { fetchWithTimeout } = await import('/src/data/fetchTimeout.mjs');
    return { run: async url => {
      try { return { status: (await fetchWithTimeout(fetch, url)).status }; }
      catch (error) { return { name: error.name, message: error.message }; }
    } };
  });
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const navigationStarted = new Promise(resolve => { started = resolve; });
  await page.route(url => url.origin === new URL(baseURL).origin && url.pathname === '/', async route => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    started();
    await held;
    await route.fallback();
  });
  let probe;
  try {
    await fixture.reloadEvidence.withExpectedReload(async () => {
      const click = gate.locator('[data-account-action=signout]').click();
      await navigationStarted;
      probe = await old.evaluate((value, url) => value.run(url),
        accountEntryAuthOrigin + '/rest/v1/app_snapshots?id=eq.space-account-entry&select=state%2Cupdated_at');
      release();
      await click;
    }, { expectedFinal: 'signed-out' });
  } finally { release(); }
  expect(probe).toMatchObject({ name: 'TypeError' });
  expect(fixture.record.pageErrors).toHaveLength(1);
  expectNoExternalFailures(fixture);
  expect(fixture.record.reloadDiagnostics).toHaveLength(1);
  expect(fixture.record.reloadDiagnostics[0].reason).toBe('webkit-unissued-signout-fetch');
  expect(fixture.record.reloadDiagnostics[0].raw).toBe(fixture.record.pageErrors[0]);
  const attempt = fixture.reloadEvidence.attempts.get(fixture.record.reloadDiagnostics[0].id);
  expect(attempt.request).toBeUndefined();
  expect(attempt.response).toBeUndefined();
  expect(attempt.failure).toBeUndefined();
  expect([...fixture.reloadEvidence.accountRequests.values()]).toContainEqual(expect.objectContaining({
    path: '/auth/v1/logout', method: 'POST', status: 200, allowOrigin: '*'
  }));
});
