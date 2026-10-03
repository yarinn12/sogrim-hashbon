import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {
  ACCOUNT_OAUTH_FLOW_QUERY_PARAM,
  appleOAuthUrl,
  createOAuthPkce,
  createAccountOAuthFlowId,
  saveAccountOAuthFlow,
  loadAccountOAuthFlow
} from '../src/data/accountAuth.mjs';

// Git archives on Windows retain CRLF; normalize line endings before extracting
// the unchanged production declarations for the native URL boundary test.
const source = (await readFile('src/publicAccountAuthLayer.mjs', 'utf8')).replaceAll('\r\n', '\n');
function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const prefix = source.slice(start - 6, start) === 'async ' ? start - 6 : start;
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(end > start);
  return source.slice(prefix, end);
}

const nativePages = [
  { href: 'capacitor://localhost', origin: 'capacitor://localhost', returnPath: '/' },
  { href: 'capacitor://localhost?view=profile', origin: 'capacitor://localhost', returnPath: '/?view=profile' },
  ...['capacitor', 'ionic'].map(scheme => ({ href: `${scheme}://localhost/index.html?view=profile`, origin: 'null', returnPath: '/index.html?view=profile' }))
];
for (const nativePage of nativePages) {
  test(`Apple OAuth opens the native browser from ${nativePage.href} (origin ${nativePage.origin})`, async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const pageUrl = new URL(nativePage.href);
    assert.equal(pageUrl.origin, 'null');
    const opened = [];
    const navigated = [];
    const context = vm.createContext({
      URL,
      window: { location: { href: pageUrl.href, origin: nativePage.origin, pathname: pageUrl.pathname } },
      location: { assign: value => navigated.push(value) },
      SogrimNative: {
        authCallbackUrl: 'https://sogrim-hesbon-app.vercel.app/auth/callback',
        openAuth: async url => { opened.push(url); return true; }
      },
      runtimeConfig: { storage: { mode: 'supabase', url: 'https://apple-launch-fixture.supabase.co', anonKey: 'fixture-public-key' } },
      pendingInviteUrl: () => '',
      ACCOUNT_OAUTH_FLOW_QUERY_PARAM,
      createOAuthPkce: () => createOAuthPkce(webcrypto),
      createAccountOAuthFlowId: () => createAccountOAuthFlowId(webcrypto),
      saveAccountOAuthFlow: flow => saveAccountOAuthFlow(flow, storage),
      appleOAuthUrl
    });
    vm.runInContext(['accountReturnPath', 'authRedirectUrl', 'secureOAuthUrl', 'openOAuthUrl'].map(declaration).join('\n'), context);
    await vm.runInContext('secureOAuthUrl(appleOAuthUrl).then(openOAuthUrl)', context);
    assert.equal(opened.length, 1, 'the final native browser boundary must receive the Apple request');
    assert.equal(navigated.length, 0);
    const authorization = new URL(opened[0]);
    assert.equal(authorization.searchParams.get('provider'), 'apple');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 's256');
    assert.ok(authorization.searchParams.get('code_challenge'));
    const callback = new URL(authorization.searchParams.get('redirect_to'));
    assert.equal(callback.origin, 'https://sogrim-hesbon-app.vercel.app');
    assert.equal(callback.pathname, '/auth/callback');
    const flow = loadAccountOAuthFlow(callback.searchParams.get(ACCOUNT_OAUTH_FLOW_QUERY_PARAM), storage);
    assert.ok(flow, 'PKCE verifier must stay bound to the callback flow');
    assert.equal(flow.returnPath, nativePage.returnPath);
    assert.equal(flow.purpose, 'oauth');
  });
}
