import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { request } from 'node:http';
import { createObservedServer } from './server.mjs';

for (const scenario of [
  { method: 'GET', path: '/', status: 200, body: '<html>synthetic</html>' },
  { method: 'GET', path: '/missing', status: 404, body: 'missing' },
  { method: 'HEAD', path: '/', status: 200, body: '' }
]) test(`observer preserves ${scenario.method} ${scenario.path} and records paired response`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sogrim-nav-observe-'));
  const logPath = join(directory, 'events.jsonl');
  let invoked = 0;
  const { server, closeLog } = createObservedServer((req, res) => {
    invoked++;
    assert.equal(req.method, scenario.method);
    assert.equal(req.url, scenario.path);
    res.writeHead(scenario.status, { 'x-synthetic-observer-control': 'unchanged' });
    res.end(scenario.body);
  }, logPath);
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    assert.equal(server.keepAliveTimeout, 5000);
    assert.equal(server.requestTimeout, 300000);
    const response = await new Promise((accept, reject) => {
      const req = request({ hostname: '127.0.0.1', port: server.address().port,
        path: scenario.path, method: scenario.method, agent: false }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c);
        res.on('end', () => accept({ status: res.statusCode, header: res.headers['x-synthetic-observer-control'], body }));
      }); req.on('error', reject); req.end();
    });
    assert.deepEqual(response, { status: scenario.status, header: 'unchanged', body: scenario.body });
    assert.equal(invoked, 1);
    await new Promise((accept, reject) => server.close(e => e ? reject(e) : accept()));
    await closeLog();
    const events = (await readFile(logPath, 'utf8')).trim().split('\n').map(JSON.parse);
    const ingress = events.filter(e => e.kind === 'request');
    const finish = events.filter(e => e.kind === 'finish');
    assert.equal(events.filter(e => e.kind === 'socket-close').length, 1);
    assert.equal(ingress.length, 1); assert.equal(finish.length, 1);
    assert.equal(finish[0].id, ingress[0].id);
    assert.equal(finish[0].connectionId, ingress[0].connectionId);
    assert.equal(finish[0].status, scenario.status);
    assert.equal(finish[0].complete, true);
    assert.ok(finish[0].elapsedMs >= 0);
  } finally {
    server.close(); server.closeAllConnections();
    const checkedDirectory = await realpath(directory);
    assert.equal(dirname(checkedDirectory), await realpath(tmpdir()));
    assert.match(basename(checkedDirectory), /^sogrim-nav-observe-[a-zA-Z0-9]+$/);
    await rm(checkedDirectory, { recursive: true, force: true });
  }
});
