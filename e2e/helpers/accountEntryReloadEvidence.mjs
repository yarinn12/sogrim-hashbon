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

export function classifyAccountEntryReloadError(error, {
  origin, browserName, attempts, accountRequests, reloads, runtimeErrors
}) {
  const stack = String(error.stack ?? '').split('\n');
  const firstLine = stack[0];
  if (browserName !== 'webkit' || error.name !== 'Fetch API cannot load https' ||
      !firstLine.startsWith(NATIVE_PREFIX) || !firstLine.endsWith(NATIVE_SUFFIX) ||
      !error.message || !firstLine.endsWith(error.message) ||
      stack.length !== 2 ||
      !/^\s+at unknown \(web-inspector:\/\/bootstrap\.js:\d+:\d+\)$/.test(stack[1])) return null;
  const url = snapshotAttemptUrl(firstLine.slice(NATIVE_PREFIX.length, -NATIVE_SUFFIX.length), origin);
  if (!url) return null;
  const id = url.searchParams.get(ATTEMPT_PARAM), attempt = attempts.get(id);
  if (!attempt || attempt.url !== url.href || attempt.request || attempt.response || attempt.failure) return null;
  const reload = reloads.find(item => {
    if (item.oldDocumentId !== attempt.documentId || !item.finalReady ||
        item.finalDocumentId === item.oldDocumentId ||
        item.navigationCommit >= item.boundaryEnd ||
        !(item.navigationStart < error.sequence && error.sequence < item.navigationCommit)) return false;
    // WebKit can reject the last old-document fetch one event before the
    // navigation request is observed, or after that request starts.
    return attempt.sequence + 1 === item.navigationStart ||
      item.navigationStart < attempt.sequence && attempt.sequence < error.sequence;
  });
  if (!reload) return null;
  if (reload.kind === 'presentation') {
    // A presentation test deliberately replaces the logged-out document.
    // Only an unissued read is safe to classify, and both documents must have
    // acknowledged the same workspace query with valid CORS headers.
    const queryNames = [...url.searchParams.keys()].filter(name => name !== ATTEMPT_PARAM);
    const workspaceRead = attempt.method === 'GET' && queryNames.length === 2 &&
      queryNames.includes('id') && queryNames.includes('select') &&
      /^eq\.space-[A-Za-z0-9_-]+$/.test(url.searchParams.get('id') ?? '') &&
      url.searchParams.get('select') === 'state,updated_at';
    const acknowledgedRead = (documentId, after, before) => [...attempts.values()].some(item => {
      const readUrl = snapshotAttemptUrl(item.url, origin);
      return item.documentId === documentId && item.method === 'GET' &&
        readUrl?.searchParams.get('id') === url.searchParams.get('id') &&
        readUrl?.searchParams.get('select') === 'state,updated_at' &&
        [...readUrl.searchParams.keys()].length === 3 &&
        item.sequence > after && item.finished < before &&
        item.response?.status >= 200 && item.response?.status < 300 &&
        [origin, '*'].includes(item.response?.allowOrigin) && !item.failure;
    });
    const unsafeSnapshot = [...attempts.values()].some(item => item !== attempt &&
      item.documentId === reload.oldDocumentId && item.sequence < reload.navigationCommit &&
      (item.failure || item.method !== 'GET' &&
        !(item.response?.status >= 200 && item.response?.status < 300 && item.finished) ||
        item.request && !(item.response?.status >= 200 && item.response?.status < 300 &&
          [origin, '*'].includes(item.response?.allowOrigin) && item.finished)));
    const unsafeAccount = [...accountRequests.values()].some(item =>
      item.sequence < reload.navigationCommit &&
      (item.failure || !(item.status >= 200 && item.status < 300 &&
        [origin, '*'].includes(item.allowOrigin) && item.finished)));
    if (!workspaceRead || !acknowledgedRead(reload.oldDocumentId, 0, reload.navigationStart) ||
        !acknowledgedRead(reload.finalDocumentId, reload.navigationCommit, reload.boundaryEnd) ||
        unsafeSnapshot || unsafeAccount || runtimeErrors.length) return null;
    return { id, url: url.href, documentId: attempt.documentId, reason: 'webkit-unissued-presentation-fetch' };
  }
  if (reload.kind === 'signout') {
    const queryNames = [...url.searchParams.keys()].filter(name => name !== ATTEMPT_PARAM);
    const workspaceRead = attempt.method === 'GET' && queryNames.length === 2 &&
      queryNames.includes('id') && queryNames.includes('select') &&
      /^eq\.space-[A-Za-z0-9_-]+$/.test(url.searchParams.get('id') ?? '') &&
      url.searchParams.get('select') === 'state,updated_at';
    const logoutAcknowledged = [...accountRequests.values()].some(item =>
      item.path === '/auth/v1/logout' && item.method === 'POST' &&
      item.status >= 200 && item.status < 300 && [origin, '*'].includes(item.allowOrigin) &&
      item.finished > reload.boundaryStart && item.finished < reload.navigationStart);
    const pendingWrite = [...attempts.values()].some(item =>
      item.documentId === attempt.documentId && item.method !== 'GET' &&
      item.sequence > reload.boundaryStart && item.sequence < reload.navigationCommit &&
      !(item.response?.status >= 200 && item.response?.status < 300 && item.finished));
    if (!workspaceRead || !logoutAcknowledged || pendingWrite || runtimeErrors.length) return null;
    return { id, url: url.href, documentId: attempt.documentId, reason: 'webkit-unissued-signout-fetch' };
  }
  const requestIdentity = value => {
    const parsed = snapshotAttemptUrl(value, origin);
    if (!parsed) return null;
    parsed.searchParams.delete(ATTEMPT_PARAM);
    return parsed.href;
  };
  const priorSameRequestAcknowledged = [...attempts.values()].some(item =>
    item !== attempt && item.documentId === attempt.documentId &&
    item.method === attempt.method && requestIdentity(item.url) === requestIdentity(attempt.url) &&
    item.response?.status >= 200 && item.response?.status < 300 &&
    [origin, '*'].includes(item.response?.allowOrigin) && item.finished &&
    item.finished > reload.boundaryStart && item.finished < reload.navigationStart);
  // A workspace metadata probe can be the first of its exact query. In that
  // case require the full workspace read on both sides of the navigation,
  // an acknowledged old-document write, and no other failed or pending work.
  const queryNames = [...url.searchParams.keys()].filter(name => name !== ATTEMPT_PARAM);
  const workspaceId = url.searchParams.get('id');
  const metadataProbe = attempt.method === 'GET' && queryNames.length === 2 &&
    queryNames.includes('id') && queryNames.includes('select') &&
    /^eq\.space-[A-Za-z0-9_-]+$/.test(workspaceId ?? '') &&
    url.searchParams.get('select') === 'updated_at';
  const sameWorkspace = item => {
    const parsed = snapshotAttemptUrl(item.url, origin);
    return parsed?.searchParams.get('id') === workspaceId;
  };
  const acknowledged = item => item.response?.status >= 200 && item.response?.status < 300 &&
    [origin, '*'].includes(item.response?.allowOrigin) && item.finished && !item.failure;
  const fullRead = (documentId, after, before) => [...attempts.values()].some(item => {
    const parsed = snapshotAttemptUrl(item.url, origin);
    return item.documentId === documentId && item.method === 'GET' && sameWorkspace(item) &&
      parsed?.searchParams.get('select') === 'state,updated_at' &&
      [...parsed.searchParams.keys()].length === 3 &&
      item.sequence > after && item.finished < before && acknowledged(item);
  });
  const metadataProof = metadataProbe &&
    fullRead(reload.oldDocumentId, reload.boundaryStart, reload.navigationStart) &&
    fullRead(reload.finalDocumentId, reload.navigationCommit, reload.boundaryEnd) &&
    [...attempts.values()].some(item =>
      item.documentId === reload.oldDocumentId && item.method !== 'GET' &&
      sameWorkspace(item) && item.sequence > reload.boundaryStart &&
      item.finished < reload.navigationStart && acknowledged(item)) &&
    ![...attempts.values()].some(item => item !== attempt &&
      item.documentId === reload.oldDocumentId &&
      item.sequence > reload.boundaryStart && item.sequence < reload.navigationCommit &&
      (item.failure || item.method !== 'GET' && !acknowledged(item) ||
        item.request && !acknowledged(item))) &&
    ![...accountRequests.values()].some(item =>
      item.sequence > reload.boundaryStart && item.sequence < reload.navigationCommit &&
      (item.failure || !(item.status >= 200 && item.status < 300 &&
        [origin, '*'].includes(item.allowOrigin) && item.finished)));
  const snapshotAcknowledged = [...attempts.values()].some(item => item.method !== 'GET' &&
    item.response?.status >= 200 && item.response?.status < 300 && item.finished &&
    item.finished > reload.boundaryStart && item.finished < reload.navigationStart);
  const accountAcknowledged = [...accountRequests.values()].some(item =>
    item.status >= 200 && item.status < 300 && item.finished &&
    item.finished > reload.boundaryStart && item.finished < reload.navigationStart);
  if ((!priorSameRequestAcknowledged && !metadataProof) || !snapshotAcknowledged ||
      !accountAcknowledged || runtimeErrors.length) return null;
  return { id, url: url.href, documentId: attempt.documentId, reason: 'webkit-unissued-reload-fetch' };
}

export function assertAccountEntryReloadLedger(record, context, annotate = () => {}) {
  const diagnostics = [], unexpected = [];
  for (const error of record.pageErrors) {
    const classified = classifyAccountEntryReloadError(error, context);
    if (classified) diagnostics.push({ ...classified, raw: error });
    else unexpected.push(error);
  }
  record.reloadDiagnostics = diagnostics;
  for (const diagnostic of diagnostics) annotate(diagnostic);
  expect(record.external).toEqual([]);
  expect(record.unmatchedRequests).toEqual([]);
  expect(record.runtimeErrors).toEqual([]);
  expect(unexpected).toEqual([]);
  // Every diagnostic needs its own unissued attempt and full reload proof;
  // one reload can race more than one independent old-document fetch.
  expect(new Set(diagnostics.map(item => item.id)).size).toBe(diagnostics.length);
  return diagnostics;
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
      requestUrl.pathname === '/auth/v1/logout' ||
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

  const withExpectedReload = async (action, { expectedFinal = 'account-ready' } = {}) => {
    if (!['account-ready', 'signed-out', 'account-gate'].includes(expectedFinal)) throw new Error('Unknown account-entry reload target');
    if (activeReload) throw new Error('Nested account-entry reload');
    const oldDocumentId = await page.evaluate(() => window.__qaAccountEntryDocumentId);
    const reload = { oldDocumentId, boundaryStart: next(), navigationStart: null,
      navigationCommit: null, finalDocumentId: null, finalReady: false };
    if (expectedFinal === 'signed-out') reload.kind = 'signout';
    if (expectedFinal === 'account-gate') reload.kind = 'presentation';
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
      if (expectedFinal === 'signed-out' || expectedFinal === 'account-gate') {
        await expect(page.locator('#public-account-auth-gate form[data-mode=login]')).toBeVisible({ timeout: 20000 });
        expect(await page.evaluate(() => localStorage.getItem('settle-friends-account-session'))).toBeNull();
      } else {
        await expect(page.getByRole('heading', { name: 'מה סוגרים היום?', exact: true })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('אירוע בדיקת החשבון', { exact: true })).toBeVisible({ timeout: 20000 });
      }
      if (expectedFinal === 'account-gate') await expect.poll(() =>
        [...attempts.values()].some(item => item.documentId === reload.finalDocumentId &&
          item.method === 'GET' && item.response?.status === 200 && item.finished &&
          [origin, '*'].includes(item.response?.allowOrigin)), { timeout: 20000 }).toBe(true);
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

  const classify = error => classifyAccountEntryReloadError(error, {
    origin, browserName, attempts, accountRequests, reloads,
    runtimeErrors: record.runtimeErrors
  });
  const assertNoExternalFailures = () => {
    return assertAccountEntryReloadLedger(record, {
      origin, browserName, attempts, accountRequests, reloads,
      runtimeErrors: record.runtimeErrors
    }, diagnostic => test.info().annotations.push({
      type: 'webkit-unissued-reload-fetch', description: JSON.stringify(diagnostic)
    }));
  };
  return { withExpectedReload, assertNoExternalFailures, classify, attempts, accountRequests, reloads };
}
