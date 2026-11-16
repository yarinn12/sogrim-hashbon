import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, Agent } from 'node:http';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { resetLocalQaStateFresh } from '../e2e/helpers/resetLocalQaStateFresh.mjs';
import { writeLocalQaStateFresh } from '../e2e/helpers/writeLocalQaStateFresh.mjs';
import { readLocalQaHtmlFresh } from '../e2e/helpers/readLocalQaHtmlFresh.mjs';

function registeredSetup() {
  let callback; const register = () => {};
  Object.assign(register, { use() {}, afterEach() {}, beforeEach(body) { assert.equal(callback, undefined); callback = body; } });
  const context = createContext({ test: register, expect() { throw new Error('UI assertion reached before fixture boundary'); }, structuredClone, process: { env: {} },
    resetLocalQaStateFresh, writeLocalQaStateFresh, readLocalQaHtmlFresh });
  const spec = readFileSync(new URL('../e2e/platform-coherence-regression.spec.mjs', import.meta.url), 'utf8');
  runInContext(spec.replace(/^import .*;\r?\n/gm, ''), context, { filename: 'platform-coherence-regression.spec.mjs' });
  assert.equal(typeof callback, 'function');
  return { callback, expected: runInContext('JSON.stringify(state)', context) };
}

async function fixture(t, respond) {
  const calls = [], uses = new WeakMap(), server = createServer(async (req, res) => {
    const use = (uses.get(req.socket) || 0) + 1; uses.set(req.socket, use);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    calls.push({ path: req.url, method: req.method, use, body: Buffer.concat(chunks).toString() }); respond(req, res, use);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  t.after(async () => { agent.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const send = (method, path, data) => new Promise((resolve, reject) => {
    const body = data === undefined ? null : Buffer.from(JSON.stringify(data));
    const req = httpRequest(new URL(path, baseURL), { method, agent, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {} }, res => {
      res.on('error', reject); res.on('aborted', () => reject(new Error('Response aborted'))); res.on('end', () => resolve({ ok: () => res.statusCode === 200 })); res.resume();
    }); req.on('error', reject); req.end(body);
  });
  return { baseURL, calls, send, request: { post: path => send('POST', path), put: (path, options) => send('PUT', path, options.data) } };
}

async function runSetup(h) {
  const sentinel = new Error('Fixture acknowledged; reached browser initialization'), setup = registeredSetup(); let outcome;
  try { await setup.callback({ baseURL: h.baseURL, page: { addInitScript() { throw sentinel; } }, request: h.request },
    { title: 'note-dialog history rewind without newer navigation returns to notes' }); } catch (error) { outcome = error; }
  return { ...setup, sentinel, outcome };
}

test('the actual platform setup reaches the UI only after a fresh reset and exact acknowledged state write', async t => {
  const h = await fixture(t, (req, res, use) => {
    if (use > 1) { req.socket.destroy(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}');
  });
  await h.send('GET', '/prime'); const result = await runSetup(h);
  assert.equal(result.outcome, result.sentinel);
  assert.deepEqual(h.calls.map(({ path, method, use }) => ({ path, method, use })), [
    { path: '/prime', method: 'GET', use: 1 }, { path: '/api/reset', method: 'POST', use: 1 }, { path: '/api/state', method: 'PUT', use: 1 }
  ]);
  assert.equal(h.calls[2].body, result.expected, 'the complete original fixture payload remains unchanged');
});

for (const stage of ['reset', 'state']) test(`the actual platform setup stops on a fresh ${stage} connection failure without retry or UI`, async t => {
  const h = await fixture(t, (req, res) => {
    if (req.url === '/api/'+stage) req.socket.destroy(); else { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); }
  });
  const result = await runSetup(h); assert.match(String(result.outcome), /socket hang up|ECONNRESET/);
  assert.equal(h.calls.filter(c => c.path === '/api/reset').length, 1);
  assert.equal(h.calls.filter(c => c.path === '/api/state').length, stage === 'state' ? 1 : 0);
});

test('the actual platform setup refuses an HTTP success without a canonical fixture acknowledgement', async t => {
  const h = await fixture(t, (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(req.url === '/api/state' ? '{"ok":false}' : '{"ok":true}'); });
  const result = await runSetup(h); assert.match(String(result.outcome), /not acknowledged/); assert.equal(h.calls.length, 2);
});

test('held-resource HTML reads use fresh connections and preserve the actual document and security headers', async t => {
  const h = await fixture(t, (req, res, use) => {
    if (use > 1) { req.socket.destroy(); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', "default-src 'self'"); res.end('<body>real entry</body>');
  });
  await h.send('GET', '/prime'); const response = await readLocalQaHtmlFresh(h.baseURL, '/?dynamic-type-preview=32');
  assert.equal(response.status, 200); assert.equal(response.body.toString(), '<body>real entry</body>');
  assert.equal(response.headers['content-security-policy'], "default-src 'self'"); assert.equal(response.headers['content-length'], undefined);
  assert.equal(h.calls[1].use, 1); assert.equal(h.calls[1].path, '/?dynamic-type-preview=32');
});

for (const status of [302, 403, 500]) test(`held HTML HTTP ${status} fails once without redirect or replay`, async t => {
  const h = await fixture(t, (_req, res) => { res.writeHead(status, { Location: '/' }); res.end('failure'); });
  await assert.rejects(readLocalQaHtmlFresh(h.baseURL), new RegExp(`HTTP ${status}`)); assert.equal(h.calls.length, 1);
});

test('held HTML rejects incomplete responses and oversized documents', async t => {
  const partial = await fixture(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': 100 }); res.write('partial'); res.destroy(); });
  await assert.rejects(readLocalQaHtmlFresh(partial.baseURL)); assert.equal(partial.calls.length, 1);
  const large = await fixture(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(Buffer.alloc(1_000_001)); });
  await assert.rejects(readLocalQaHtmlFresh(large.baseURL)); assert.equal(large.calls.length, 1);
});

test('held HTML refuses remote, credentialed and unrelated local endpoints', async () => {
  for (const [origin, path] of [['https://example.invalid', '/'], ['http://127.0.0.1:1', 'http://127.0.0.1:2/'], ['http://user:pass@127.0.0.1:1', '/'], ['http://127.0.0.1:1', '/api/reset']])
    await assert.rejects(readLocalQaHtmlFresh(origin, path), /local loopback/);
});
