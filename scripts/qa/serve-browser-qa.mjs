import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppHandler } from '../../server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function createBrowserQaServer({ port, env = process.env } = {}) {
  assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid local QA port');
  assert.equal(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD, '1', 'Private environment must remain disabled');
  assert.ok(env.NODE_ENV !== 'production' && !env.VERCEL && !env.VERCEL_ENV && !env.RENDER && !env.RENDER_SERVICE_ID,
    'The browser QA transport is restricted to the isolated local fixture');
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'GOOGLE_CLIENT_ID']) {
    assert.equal(String(env[name] || '').trim(), '', 'Private services must remain disconnected: ' + name);
  }
  const handler = createAppHandler({ root, port, env });
  return createServer((request, response) => {
    // A reload must not inherit an idle HTTP/1.1 socket from the preceding
    // document. Keep the actual application handler, payloads and errors intact.
    // This transport is only for isolated loopback browser fixtures; deployed
    // HTTP servers and the native asset protocols keep their existing behavior.
    response.setHeader('Connection', 'close');
    return handler(request, response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'One explicit loopback port is required');
  const port = Number(process.argv[2]);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid local QA port');
  createBrowserQaServer({ port }).listen(port, '127.0.0.1', () => {
    console.log(`Browser QA server listening on http://127.0.0.1:${port}`);
  });
}
