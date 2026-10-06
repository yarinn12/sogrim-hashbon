import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { signInWithIdToken } from '../src/data/accountAuth.mjs';

const source = (await readFile('src/publicAccountAuthLayer.mjs', 'utf8')).replaceAll('\r\n', '\n');
function declaration(name) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const hash = value => createHash('sha256').update(value).digest('hex');

function nativeFlow({ platform = 'ios', tamper = false, providerFailure = false } = {}) {
  const sdkRequests = [], exchanges = [], opened = [];
  const context = vm.createContext({
    Uint8Array, TextEncoder, btoa, window: { crypto: webcrypto },
    isNativeIos: () => platform === 'ios', accountSession: null,
    // Observe the old automatic fallback without hiding the original rejection.
    renderAccountGate() {}, accountAuthErrorMessage: error => error.message,
    googleOAuthUrl() {}, secureOAuthUrl: async () => 'https://fixture.invalid/authorize',
    openOAuthUrl: async url => opened.push(url),
    prepareNativeGoogleSignIn: async () => ({ login: async request => {
      sdkRequests.push(request);
      if (providerFailure) throw Object.assign(new Error('Google cancelled'), { status: 400 });
      // AppAuth generates a nonce even when the application omits it. Google
      // echoes that nonce in the ID token. This boundary is synthetic: no Google
      // signature or real account is claimed by this fixture.
      const nonce = platform === 'ios'
        ? request.options.nonce || randomBytes(32).toString('base64url')
        : '';
      const claims = { nonce: tamper ? 'another-request-nonce' : nonce };
      return { result: { idToken: `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`, accessToken: { token: 'fixture-access' } } };
    } }),
    completeGoogleIdTokenSignIn: async credentials => {
      const session = await signInWithIdToken({ storage: { mode: 'supabase', url: 'https://nonce-fixture.supabase.co', anonKey: 'fixture-key' } },
        { provider: 'google', token: credentials.idToken, accessToken: credentials.accessToken, nonce: credentials.nonce },
        async (url, options) => {
          const body = JSON.parse(options.body);
          exchanges.push({ url, body });
          const claim = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url')).nonce;
          // Supabase token_oidc.go requires both nonce values to exist together
          // and the token's nonce to equal SHA-256(raw request nonce), as hex.
          const error = Boolean(claim) !== Boolean(body.nonce)
            ? 'Passed nonce and nonce in id_token should either both exist or not.'
            : claim && hash(body.nonce) !== claim ? 'Nonces mismatch' : '';
          if (error) return new Response(JSON.stringify({ message: error }), { status: 400 });
          return new Response(JSON.stringify({ access_token: 'fixture-session', refresh_token: 'fixture-refresh', expires_in: 3600, user: { id: 'native-nonce-account' } }));
        });
      context.accountSession = session;
    }
  });
  vm.runInContext([declaration('createWebGoogleNonce'), declaration('signInWithNativeGoogle')].join('\n'), context);
  return { context, sdkRequests, exchanges, opened, signIn: () => vm.runInContext('signInWithNativeGoogle()', context) };
}

test('native iOS Google sends the same per-attempt nonce through the SDK and actual ID-token HTTP exchange', async () => {
  const flow = nativeFlow();
  await flow.signIn();
  assert.ok(flow.context.accountSession, 'the ID-token exchange must accept the nonce contract');
  assert.equal(flow.exchanges.length, 1);
  assert.match(flow.exchanges[0].url, /token\?grant_type=id_token$/);
  const { nonce: raw } = flow.exchanges[0].body;
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(flow.sdkRequests[0].options.nonce, hash(raw));
  assert.equal(flow.sdkRequests[0].options.forcePrompt, true, 'a restored ID token cannot carry the fresh request nonce');
  assert.equal(flow.opened.length, 0);
  await flow.signIn();
  assert.notEqual(flow.exchanges[1].body.nonce, raw, 'each sign-in uses independent entropy');
  assert.equal(flow.sdkRequests[1].options.nonce, hash(flow.exchanges[1].body.nonce));
});

test('native Google rejects a nonce from another attempt and never starts external authorization', async () => {
  const flow = nativeFlow({ tamper: true });
  await assert.rejects(flow.signIn(), error => error.status === 400 && error.message === 'Nonces mismatch');
  assert.equal(flow.context.accountSession, null);
  assert.equal(flow.opened.length, 0);
});

test('Android Google keeps its existing credential options and nonce-free exchange', async () => {
  const flow = nativeFlow({ platform: 'android' });
  await flow.signIn();
  assert.ok(flow.context.accountSession);
  assert.equal(flow.sdkRequests[0].options.nonce, undefined);
  assert.equal(flow.exchanges[0].body.nonce, undefined);
  assert.equal(flow.sdkRequests[0].options.style, 'standard');
  assert.equal(flow.opened.length, 0);
});

test('Google cancellation never exchanges a credential or opens a second sign-in', async () => {
  const flow = nativeFlow({ providerFailure: true });
  await assert.rejects(flow.signIn(), /Google cancelled/);
  assert.equal(flow.exchanges.length, 0);
  assert.equal(flow.opened.length, 0);
});
