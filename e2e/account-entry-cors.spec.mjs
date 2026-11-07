import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { accountEntryCorsHeaders } from './helpers/accountEntryBatchPresentation.mjs';

test('account entry fixture permits an authenticated cross-origin snapshot read', async ({ page }) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, authorization: request.headers.authorization,
      requestedHeaders: request.headers['access-control-request-headers'] });
    response.writeHead(request.method === 'OPTIONS' ? 204 : 200, {
      ...accountEntryCorsHeaders, 'content-type': 'application/json'
    });
    response.end(request.method === 'OPTIONS' ? '' : JSON.stringify({ state: 'synthetic snapshot' }));
  });
  const originServer = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Account CORS boundary</title>');
  });
  const listen = owned => new Promise((resolve, reject) => {
    owned.once('error', reject);
    owned.listen(0, '127.0.0.1', resolve);
  });
  const close = owned => {
    if (!owned.listening) return Promise.resolve();
    owned.closeAllConnections();
    return new Promise((resolve, reject) => owned.close(error => error ? reject(error) : resolve()));
  };
  try {
    await listen(server);
    await listen(originServer);
    const address = server.address();
    expect(typeof address).toBe('object');
    // Both documents use real loopback transport. A routed top-level document
    // has no remote IP and can trigger Chromium's unrelated address-space gate.
    const origin = `http://127.0.0.1:${originServer.address().port}`;
    const target = `http://127.0.0.1:${address.port}/app_snapshots`;
    await page.goto(origin + '/');
    // Assert the actual preflight wire contract independently of an engine's
    // wildcard tolerance: Fetch requires Authorization to be named explicitly.
    const preflight = await page.request.fetch(target, { method: 'OPTIONS', headers: {
      origin, 'access-control-request-method': 'GET',
      'access-control-request-headers': 'apikey,authorization'
    } });
    expect(preflight.status()).toBe(204);
    const allowedHeaders = preflight.headers()['access-control-allow-headers']
      .toLowerCase().split(/,\s*/);
    expect(allowedHeaders).toContain('authorization');
    // This reaches a real second HTTP origin; no Playwright route can bypass
    // the browser's preflight or turn a rejected request into synthetic success.
    const value = await page.evaluate(async url => {
      const response = await fetch(url, { credentials: 'omit', headers: {
        authorization: 'Bearer synthetic-cors-regression', apikey: 'synthetic-public-key'
      } });
      if (!response.ok) throw new Error('Synthetic CORS response was not successful');
      return response.json();
    }, target);
    expect(value).toEqual({ state: 'synthetic snapshot' });
    expect(requests.every(request => ['OPTIONS', 'GET'].includes(request.method))).toBe(true);
    expect(requests.filter(request => request.method === 'GET')).toHaveLength(1);
    expect(requests[0].requestedHeaders.toLowerCase().split(/,\s*/).sort()).toEqual(['apikey', 'authorization']);
    expect(requests.find(request => request.method === 'GET').authorization).toBe('Bearer synthetic-cors-regression');
  } finally {
    await Promise.all([close(server), close(originServer)]);
  }
});
