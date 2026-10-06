import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import {
  ACCOUNT_OAUTH_FLOW_QUERY_PARAM, accountAuthErrorMessage, createAccountOAuthFlowId,
  createOAuthPkce, createOAuthPkceChallenge, googleOAuthUrl, loadAccountOAuthFlow,
  saveAccountOAuthFlow, signInWithIdToken
} from '../src/data/accountAuth.mjs';

const source = (await readFile('src/publicAccountAuthLayer.mjs', 'utf8')).replaceAll('\r\n', '\n');
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  return source.slice(source.slice(start - 6, start) === 'async ' ? start - 6 : start, end);
}

function recovery({ platform = 'ios', status = 400, acceptedAccount = false, openFailure = false } = {}) {
  const opened = [], calls = [], gates = [];
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const config = { storage: { mode: 'supabase', url: 'https://google-recovery-fixture.supabase.co', anonKey: 'fixture-public-key' } };
  const rejection = new Error('Unacceptable audience in id_token');
  rejection.status = status;
  const context = vm.createContext({
    URL,
    window: { crypto: webcrypto, location: { href: 'capacitor://localhost', pathname: '', origin: 'capacitor://localhost' } },
    Uint8Array, TextEncoder, btoa,
    location: { assign: () => assert.fail('iOS recovery must use the native authentication browser') },
    accountSession: acceptedAccount ? { user: { id: 'already-accepted-account' } } : null,
    runtimeConfig: config, isNativeIos: () => platform === 'ios', pendingInviteUrl: () => '',
    ACCOUNT_OAUTH_FLOW_QUERY_PARAM, accountAuthErrorMessage, googleOAuthUrl,
    createOAuthPkce: () => createOAuthPkce(webcrypto),
    createAccountOAuthFlowId: () => createAccountOAuthFlowId(webcrypto),
    saveAccountOAuthFlow: flow => saveAccountOAuthFlow(flow, storage),
    renderAccountGate: gate => gates.push(gate),
    prepareNativeGoogleSignIn: async () => ({ login: async () => ({ result: { idToken: 'fixture-rejected-google-id', accessToken: { token: 'fixture-google-access' } } }) }),
    completeGoogleIdTokenSignIn: async credentials => {
      if (acceptedAccount) throw rejection;
      await signInWithIdToken(config, { provider: 'google', token: credentials.idToken, accessToken: credentials.accessToken }, async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ message: rejection.message }), { status });
      });
    },
    SogrimNative: { authCallbackUrl: 'https://sogrim-hesbon-app.vercel.app/auth/callback', openAuth: async url => { opened.push(url); if (openFailure) throw new Error('Native browser unavailable'); return true; } }
  });
  vm.runInContext(['createWebGoogleNonce', 'accountReturnPath', 'authRedirectUrl', 'secureOAuthUrl', 'openOAuthUrl', 'signInWithNativeGoogle'].map(declaration).join('\n'), context);
  return { context, opened, calls, gates, storage };
}

test('a rejected native iOS Google identity stays signed out and returns its error without external authorization', async () => {
  const fixture = recovery();
  await assert.rejects(vm.runInContext('signInWithNativeGoogle()', fixture.context), error => error.status === 400 && error.message.includes('Unacceptable audience'));
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].body.provider, 'google');
  assert.equal(fixture.opened.length, 0, 'a failed native attempt must not open a second sign-in');
  assert.equal(fixture.context.accountSession, null, 'a rejected identity token must never establish an account');
  assert.equal(fixture.gates.length, 0, 'the existing click handler owns visible error feedback');
});

for (const options of [{ platform: 'android' }, { status: 401 }, { status: 403 }, { status: 429 }, { status: 503 }, { acceptedAccount: true }]) {
  test(`Google recovery preserves failures without starting another authorization: ${JSON.stringify(options)}`, async () => {
    const fixture = recovery(options);
    await assert.rejects(vm.runInContext('signInWithNativeGoogle()', fixture.context), error => error.status === (options.status ?? 400));
    assert.equal(fixture.opened.length, 0);
    assert.equal(fixture.gates.length, 0);
  });
}

test('a subsequent native retry preserves the original rejection without opening a browser', async () => {
  const fixture = recovery({ openFailure: true });
  await assert.rejects(vm.runInContext('signInWithNativeGoogle()', fixture.context), error => error.status === 400 && error.message.includes('Unacceptable audience'));
  await assert.rejects(vm.runInContext('signInWithNativeGoogle()', fixture.context), error => error.status === 400 && error.message.includes('Unacceptable audience'));
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.opened.length, 0);
  assert.equal(fixture.context.accountSession, null);
});

test('Google identity rejection offers another authorization without asserting that an app update is required', () => {
  const message = accountAuthErrorMessage(Object.assign(new Error('Unacceptable audience in id_token'), { status: 400 }), 'google');
  assert.match(message, /Google/);
  assert.match(message, /החשבון/);
  assert.doesNotMatch(message, /לעדכן|עדכון/);
});
