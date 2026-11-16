import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent, get } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createBrowserQaServer } from '../scripts/qa/serve-browser-qa.mjs';

const env = Object.freeze({ SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD: '1' });

async function withServer(run) {
  const server = createBrowserQaServer({ port: 0, env });
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const read = path => new Promise((resolve, reject) => {
    const request = get(base + path, { agent }, response => {
      const parts = [];
      response.on('data', part => parts.push(part));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(parts), socket: request.socket, reusedSocket: request.reusedSocket }));
    });
    request.on('error', reject);
  });
  try { await run(read); } finally {
    agent.destroy();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('browser QA reload fetches exact modules on fresh connections instead of reusing an idle document socket', async () => {
  await withServer(async read => {
    const first = await read('/src/publicScrollIntentLayer.mjs?pwa_release=532');
    const second = await read('/src/publicScrollIntentLayer.mjs?pwa_release=532');
    const expected = await readFile(new URL('../src/publicScrollIntentLayer.mjs', import.meta.url));
    for (const value of [first, second]) {
      assert.equal(value.status, 200);
      assert.deepEqual(value.body, expected, 'The real static handler must deliver every original module byte');
      assert.match(value.headers['content-type'], /javascript/);
      assert.equal(value.headers['x-content-type-options'], 'nosniff');
    }
    assert.equal(second.reusedSocket, false, 'A previous document socket must not enter the next module load');
    assert.notEqual(first.socket, second.socket);
    assert.equal(first.headers.connection, 'close');
    assert.equal(second.headers.connection, 'close');
  });
});

test('isolated browser transport preserves the real static deny-list and security headers', async () => {
  await withServer(async read => {
    for (const path of ['/src/server/envFile.mjs', '/src//server/envFile.mjs', '/.env']) {
      const result = await read(path);
      assert.equal(result.status, 404);
      assert.equal(result.body.toString(), 'Not found');
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
      assert.match(result.headers['content-security-policy'], /object-src 'none'/);
    }
  });
});

test('browser QA transport refuses deployed environments, service credentials and missing isolation', () => {
  for (const changes of [{ SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD: '0' }, { NODE_ENV: 'production' },
    { VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { RENDER: 'true' }, { RENDER_SERVICE_ID: 'service' },
    { SUPABASE_URL: 'https://synthetic.invalid' }, { SUPABASE_ANON_KEY: 'synthetic' },
    { SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }, { SUPABASE_SECRET_KEY: 'synthetic' }, { GOOGLE_CLIENT_ID: 'synthetic' }]) {
    assert.throws(() => createBrowserQaServer({ port: 0, env: { ...env, ...changes } }));
  }
  for (const port of [-1, 65536, 1.5, NaN]) assert.throws(() => createBrowserQaServer({ port, env }));
});
