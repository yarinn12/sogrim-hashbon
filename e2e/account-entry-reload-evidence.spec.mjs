import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import {
  accountEntryAuthOrigin, expectNoExternalFailures,
  openAccountEntry, prepareAccountEntry
} from './helpers/accountEntryBatchPresentation.mjs';
import { installAccountEntryReloadEvidence } from './helpers/accountEntryReloadEvidence.mjs';

test.use({ serviceWorkers: 'block' });

test('account entry reload evidence: a real CORS refusal remains a failure', async ({ page, browserName }) => {
  const record = { external: [], pageErrors: [], runtimeErrors: [], unmatchedRequests: [], reloadDiagnostics: [] };
  const reloadEvidence = await installAccountEntryReloadEvidence(page, {
    origin: accountEntryAuthOrigin, record, browserName
  });
  const fixture = { record, reloadEvidence };
  let ingress = 0;
  const targetServer = createServer((_request, response) => {
    ingress++;
    response.setHeader('content-type', 'application/json');
    response.end('{"ok":true}');
  });
  const originServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Account CORS refusal probe</title>');
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const close = server => {
    if (!server.listening) return Promise.resolve();
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  };
  const failures = [], consoleErrors = [], responses = [], finished = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    await listen(originServer);
    await listen(targetServer);
    const origin = 'http://127.0.0.1:' + originServer.address().port;
    const probeUrl = 'http://127.0.0.1:' + targetServer.address().port + '/cors-refusal';
    page.on('requestfailed', request => {
      if (request.url() === probeUrl) failures.push(request.failure()?.errorText ?? 'unknown');
    });
    page.on('response', response => {
      if (response.url() === probeUrl) responses.push({ status: response.status(),
        allowOrigin: response.headers()['access-control-allow-origin'] ?? null });
    });
    page.on('requestfinished', request => {
      if (request.url() === probeUrl) finished.push(request.url());
    });
    // A real top-level document gives Chromium the remote IP it needs to
    // reach the second server and exercise CORS, rather than local access.
    await page.goto(origin + '/');
    const outcome = await page.evaluate(async url => {
      try { await fetch(url);return 'unexpected-success'; }
      catch (error) { return error.name; }
    }, probeUrl);
    expect(outcome).toBe('TypeError');
    expect(ingress).toBeGreaterThan(0);
    await expect.poll(() => failures.length + consoleErrors.length + fixture.record.pageErrors.length).toBeGreaterThan(0);
    expect(fixture.record.pageErrors.every(error => fixture.reloadEvidence.classify(error) === null)).toBe(true);
    if (browserName === 'webkit') {
      expect(fixture.record.pageErrors.length).toBeGreaterThan(0);
      expect(fixture.record.pageErrors.some(error =>
        (String(error.message) + String(error.stack)).includes('access control checks'))).toBe(true);
      expect(() => expectNoExternalFailures(fixture)).toThrow();
    } else {
      expect(fixture.record.pageErrors).toEqual([]);
      if (browserName === 'firefox') {
        // Firefox completes HTTP 200, then refuses exposure to JavaScript.
        // Chromium reports this same CORS refusal as requestfailed instead.
        expect(responses).toEqual([{ status: 200, allowOrigin: null }]);
        expect(finished).toEqual([probeUrl]);
      } else expect(failures.length).toBeGreaterThan(0);
      const corsRefusal = browserName === 'firefox' ? /CORS|Cross-Origin/i : /CORS policy/;
      expect(consoleErrors.some(message => message.includes(probeUrl) && corsRefusal.test(message))).toBe(true);
    }
  } finally {
    await Promise.all([close(targetServer), close(originServer)]);
  }
});

test('account entry reload evidence: JavaScript throw and unhandled rejection remain failures', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL);
  await openAccountEntry(page);
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('synthetic-account-throw'); }, 0);
    setTimeout(() => { void Promise.reject(new Error('synthetic-account-rejection')); }, 0);
  });
  await expect.poll(() => fixture.record.pageErrors.length).toBeGreaterThanOrEqual(2);
  await expect.poll(() => fixture.record.runtimeErrors.length).toBeGreaterThanOrEqual(2);
  expect(fixture.record.pageErrors.map(error => error.message).join('\n')).toContain('synthetic-account-throw');
  expect(fixture.record.pageErrors.map(error => error.message).join('\n')).toContain('synthetic-account-rejection');
  expect(() => expectNoExternalFailures(fixture)).toThrow();
});

test('account entry reload evidence: an unknown snapshot loader diagnostic remains a failure', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL);
  await openAccountEntry(page);
  const url = accountEntryAuthOrigin + '/rest/v1/app_snapshots?__qa_account_attempt=unknown';
  const message = 'Fetch API cannot load ' + url + ' due to access control checks.';
  const error = { name: 'Fetch API cannot load https', message, stack: message + '\n    at fetchWithTimeout (' + baseURL + '/src/data/fetchTimeout.mjs:40:12)', sequence: 1 };
  fixture.record.pageErrors.push(error);
  expect(fixture.reloadEvidence.classify(error)).toBeNull();
  expect(() => expectNoExternalFailures(fixture)).toThrow();
  expect(fixture.record.pageErrors).toContain(error);
});
