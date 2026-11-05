import { expect, test } from '@playwright/test';

const ATTEMPT_PARAM = '__qa_account_attempt';
const SNAPSHOT_PATH = '/rest/v1/app_snapshots';
const NATIVE_PREFIX = 'Fetch API cannot load ';
const NATIVE_SUFFIX = ' due to access control checks.';

function snapshotAttemptUrl(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname === SNAPSHOT_PATH && url.searchParams.has(ATTEMPT_PARAM)
      ? url : null;
  } catch { return null; }
}

export async function installAccountEntryReloadEvidence(page, { origin, record, browserName }) {
  let sequence = 0;
  let activeReload = null;
  const attempts = new Map();
  const accountRequests = new Map();
  const reloads = [];
  const requestByObject = new Map();
  const next = () => ++sequence;

  await page.exposeBinding('__qaAccountEntryEvent', (_source, event) => {
    const entry = { ...event, sequence: next() };
    if (event.kind === 'attempt') attempts.set(event.id, entry);
    else if (event.kind === 'runtime') record.runtimeErrors.push(entry);
  });
  await page.addInitScript(({ origin, attemptParam }) => {
    const documentId = crypto.randomUUID();
    Object.defineProperty(window, '__qaAccountEntryDocumentId', { value: documentId });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let url;
      try { url = new URL(input instanceof Request ? input.url : input, location.href); }
      catch { return nativeFetch(input, init); }
      if (url.origin !== origin || url.pathname !== '/rest/v1/app_snapshots') return nativeFetch(input, init);
      const id = crypto.randomUUID();
      url.searchParams.set(attemptParam, id);
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const taggedInput = input instanceof Request ? new Request(url.href, input) : url.href;
      return window.__qaAccountEntryEvent({ kind: 'attempt', id, documentId, method, url: url.href })
        .then(() => nativeFetch(taggedInput, init));
    };
    const report = (eventKind, error) => {
      void window.__qaAccountEntryEvent({ kind: 'runtime', documentId, eventKind,
        name: String(error?.name ?? ''), message: String(error?.message ?? error ?? '') });
    };
    window.addEventListener('error', event => report('error', event.error ?? event.message));
    window.addEventListener('unhandledrejection', event => report('unhandledrejection', event.reason));
  }, { origin, attemptParam: ATTEMPT_PARAM });

  page.on('request', request => {
    const seq = next();
    if (activeReload && request.isNavigationRequest()) {
      try { if (request.frame() === page.mainFrame()) activeReload.navigationStart ||= seq; }
      catch { /* An early navigation request can precede frame attachment. */ }
    }
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === origin && (
      requestUrl.pathname === '/auth/v1/token' ||
      requestUrl.pathname === '/auth/v1/user' && request.method() === 'PUT' ||
      requestUrl.pathname === '/rest/v1/rpc/set_friend_username')) {
      accountRequests.set(request, { path: requestUrl.pathname, method: request.method(), sequence: seq });
    }
    const url = snapshotAttemptUrl(request.url(), origin);
    if (!url) return;
    const id = url.searchParams.get(ATTEMPT_PARAM);
    requestByObject.set(request, id);
    const attempt = attempts.get(id);
    if (attempt) attempt.request = { sequence: seq, method: request.method(), url: request.url() };
    else record.unmatchedRequests.push({ id, url: request.url(), sequence: seq });
  });
  page.on('response', response => {
    const request = response.request(), id = requestByObject.get(request);
    const accountRequest = accountRequests.get(request);
    if (accountRequest) {
      accountRequest.status = response.status();
      accountRequest.response = next();
      accountRequest.allowOrigin = response.headers()['access-control-allow-origin'] ?? null;
    }
    if (!id) return;
    const attempt = attempts.get(id);
    if (attempt) attempt.response = { sequence: next(), status: response.status(),
      allowOrigin: response.headers()['access-control-allow-origin'] ?? null };
  });
  page.on('requestfinished', request => {
    const id = requestByObject.get(request), attempt = attempts.get(id);
    if (attempt) attempt.finished = next();
    const accountRequest = accountRequests.get(request);
    if (accountRequest) accountRequest.finished = next();
    requestByObject.delete(request);
  });
  page.on('requestfailed', request => {
    const id = requestByObject.get(request), attempt = attempts.get(id);
    if (attempt) attempt.failure = { sequence: next(), text: request.failure()?.errorText ?? 'unknown' };
    const accountRequest = accountRequests.get(request);
    if (accountRequest) accountRequest.failure = { sequence: next(), text: request.failure()?.errorText ?? 'unknown' };
    requestByObject.delete(request);
  });
  page.on('framenavigated', frame => {
    if (activeReload && frame === page.mainFrame() && activeReload.navigationStart)
      activeReload.navigationCommit ||= next();
  });
  page.on('pageerror', error => record.pageErrors.push({ name: error.name, message: error.message,
    stack: error.stack, sequence: next() }));

  const withExpectedReload = async action => {
    if (activeReload) throw new Error('Nested account-entry reload');
    const oldDocumentId = await page.evaluate(() => window.__qaAccountEntryDocumentId);
    const reload = { oldDocumentId, boundaryStart: next(), navigationStart: null,
      navigationCommit: null, finalDocumentId: null, finalReady: false };
    activeReload = reload;
    try {
      await action();
      await expect.poll(async () => {
        try {
          const id = await page.evaluate(() => window.__qaAccountEntryDocumentId);
          return Boolean(id && id !== oldDocumentId);
        }
        catch (error) {
          if (/Execution context was destroyed/.test(String(error))) return false;
          throw error;
        }
      }, { timeout: 20000 })
        .toBe(true);
      await page.waitForLoadState('load');
      reload.finalDocumentId = await page.evaluate(() => window.__qaAccountEntryDocumentId);
      await expect(page.getByRole('heading', { name: 'מה סוגרים היום?', exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('אירוע בדיקת החשבון', { exact: true })).toBeVisible({ timeout: 20000 });
      reload.finalReady = true;
      reload.boundaryEnd = next();
      expect(reload.navigationStart).toBeGreaterThan(reload.boundaryStart);
      expect(reload.navigationCommit).toBeGreaterThan(reload.navigationStart);
      expect(reload.finalDocumentId).not.toBe(reload.oldDocumentId);
      reloads.push(reload);
      await test.info().attach('account-entry-reload-evidence', {
        body: JSON.stringify({ reload, rawPageErrors: record.pageErrors,
          runtimeErrors: record.runtimeErrors, attempts: [...attempts.values()],
          accountRequests: [...accountRequests.values()] }, null, 2),
        contentType: 'application/json'
      });
      return reload;
    } finally { activeReload = null; }
  };

  const classify = error => {
    const firstLine = String(error.stack ?? '').split('\n')[0];
    if (browserName !== 'webkit' || error.name !== 'Fetch API cannot load https' ||
        !firstLine.startsWith(NATIVE_PREFIX) || !firstLine.endsWith(NATIVE_SUFFIX)) return null;
    const url = snapshotAttemptUrl(firstLine.slice(NATIVE_PREFIX.length, -NATIVE_SUFFIX.length), origin);
    if (!url) return null;
    const id = url.searchParams.get(ATTEMPT_PARAM), attempt = attempts.get(id);
    if (!attempt || attempt.url !== url.href || attempt.request || attempt.response || attempt.failure) return null;
    const reload = reloads.find(item => item.oldDocumentId === attempt.documentId &&
      item.navigationStart < attempt.sequence && attempt.sequence < item.navigationCommit &&
      item.navigationCommit < item.boundaryEnd && item.finalDocumentId !== item.oldDocumentId &&
      item.finalReady && error.sequence >= attempt.sequence && error.sequence < item.boundaryEnd);
    if (!reload) return null;
    const snapshotAcknowledged = [...attempts.values()].some(item => item.method !== 'GET' &&
      item.response?.status >= 200 && item.response?.status < 300 && item.finished &&
      item.finished > reload.boundaryStart && item.finished < reload.navigationStart);
    const accountAcknowledged = [...accountRequests.values()].some(item =>
      item.status >= 200 && item.status < 300 && item.finished &&
      item.finished > reload.boundaryStart && item.finished < reload.navigationStart);
    if (!snapshotAcknowledged || !accountAcknowledged || record.runtimeErrors.length) return null;
    return { id, url: url.href, documentId: attempt.documentId, reason: 'webkit-unissued-reload-fetch' };
  };
  const assertNoExternalFailures = () => {
    const diagnostics = [], unexpected = [];
    for (const error of record.pageErrors) {
      const classified = classify(error);
      if (classified) diagnostics.push({ ...classified, raw: error });
      else unexpected.push(error);
    }
    record.reloadDiagnostics = diagnostics;
    for (const diagnostic of diagnostics) test.info().annotations.push({
      type: 'webkit-unissued-reload-fetch', description: JSON.stringify(diagnostic)
    });
    expect(record.external).toEqual([]);
    expect(record.unmatchedRequests).toEqual([]);
    expect(record.runtimeErrors).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(diagnostics.length).toBeLessThanOrEqual(reloads.length);
  };
  return { withExpectedReload, assertNoExternalFailures, classify, attempts, accountRequests, reloads };
}
