import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export const accountEntryAuthOrigin = 'https://account-entry-e2e.supabase.co';
export const accountEntryUserId = '11111111-1111-4111-8111-111111111111';
export const accountEntryEmail = 'account-entry@example.com';
const bootstrap = await readFile(new URL('../fixtures/accountEntryBatchBootstrap.js', import.meta.url), 'utf8');
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };

export async function prepareAccountEntry(page, baseURL, options = {}) {
  let user = {
    id: accountEntryUserId, email: accountEntryEmail, app_metadata: { provider: 'email' },
    user_metadata: {
      full_name: options.incompleteName ? '' : 'נועם לוי', username: options.incompleteUsername ? '' : 'noam_levi',
      account_space_id: 'space-account-entry', account_space_key: 'abcdefghijklmnopqrstuvwxyzABCDEF'
    }
  };
  const participantId = 'account-' + user.id;
  let state = {
    currentParticipantId: participantId,
    participants: [{ id: participantId, displayName: 'נועם לוי', kind: 'user', accountLinked: true, authSubject: user.id }],
    friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: [],
    events: [{ id: 'account-entry-event', name: 'אירוע בדיקת החשבון', currency: 'ILS', participantIds: [participantId], adminIds: [participantId], createdByParticipantId: participantId, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', expenses: [], transfers: [], activityLog: [] }]
  };
  const session = { access_token: 'synthetic-account-entry-access', refresh_token: 'synthetic-account-entry-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const runtimeConfig = {
    publicUrl: baseURL,
    storage: { mode: 'supabase', url: accountEntryAuthOrigin, anonKey: 'synthetic-public-key', table: 'app_snapshots' },
    auth: { googleClientId: 'fixture-web.apps.googleusercontent.com', googleIosClientId: 'fixture-ios.apps.googleusercontent.com' },
    launch: { googleAuthReady: Boolean(options.nativeProviders), googleIosAuthReady: Boolean(options.nativeProviders), authEmailDeliveryReady: true }
  };
  const record = { passwords: [], signup: [], recover: [], resend: [], userUpdates: [], username: [], snapshotWrites: [], external: [], pageErrors: [], methods: [] };
  let failedUserWrites = 0, failedUsernames = 0;
  page.on('pageerror', error => record.pageErrors.push(error.message));
  await page.addInitScript({ content: '(' + bootstrap + ')(' + JSON.stringify({ session: options.authenticated || options.recovery ? session : null, recovery: Boolean(options.recovery), nativeProviders: Boolean(options.nativeProviders), runtimeConfig }) + ')' });
  // Optional immutable OLD source for explicit regression proof. Other tests use
  // the server's checkout unchanged, including the production auth entry point.
  const baseline = process.env.ACCOUNT_ENTRY_BASELINE_MODULE;
  if (baseline) await page.route('**/src/publicAccountAuthLayer.mjs*', async route => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: await readFile(baseline, 'utf8') }));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, json: body });
    if (url.origin === new URL(baseURL).origin) {
      if (url.pathname === '/api/config') return json(runtimeConfig);
      if (url.pathname.startsWith('/api/')) return json([]);
      return route.fallback();
    }
    if (url.origin !== accountEntryAuthOrigin) { record.external.push(url.origin + url.pathname); return route.abort(); }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    record.methods.push({ path: url.pathname, method });
    if (url.pathname.endsWith('/auth/v1/settings')) {
      if (options.holdProviders) await options.holdProviders;
      return json({ external: { google: Boolean(options.nativeProviders), apple: Boolean(options.nativeProviders), email: true } });
    }
    if (url.pathname.endsWith('/auth/v1/token')) {
      const payload = request.postDataJSON();record.passwords.push({ payload, grant: url.searchParams.get('grant_type') });
      if (!options.acceptLogin || options.rejectLoginOnce && record.passwords.length === 1) return json({ message: options.unconfirmed ? 'Email not confirmed' : 'Invalid login credentials' }, 400);
      return json({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: 3600, token_type: 'bearer', user });
    }
    if (url.pathname.endsWith('/auth/v1/signup')) {
      record.signup.push({ payload: request.postDataJSON(), redirect: url.searchParams.get('redirect_to') });
      return options.rejectSignup ? json({ message: 'User already registered' }, 400) : json({ user });
    }
    if (url.pathname.endsWith('/auth/v1/recover')) { record.recover.push({ payload: request.postDataJSON(), redirect: url.searchParams.get('redirect_to') });return json({}); }
    if (url.pathname.endsWith('/auth/v1/resend')) { record.resend.push(request.postDataJSON());return json({}); }
    if (url.pathname.endsWith('/auth/v1/logout')) return json({});
    if (url.pathname.endsWith('/auth/v1/user')) {
      if (method === 'PUT') {
        const payload = request.postDataJSON();record.userUpdates.push({ payload, authorization: request.headers().authorization });
        if (options.failUserWriteOnce && failedUserWrites++ === 0) return json({ message: 'temporary account service outage' }, 503);
        if (payload.data) user = { ...user, user_metadata: { ...user.user_metadata, ...payload.data } };
      }
      return json(user);
    }
    if (url.pathname.endsWith('/rpc/ensure_account_workspace')) return json({ status: 'existing', workspaceId: user.user_metadata.account_space_id });
    if (url.pathname.endsWith('/rpc/set_friend_username')) {
      record.username.push(request.postDataJSON());
      if (options.usernameCollisionOnce && failedUsernames++ === 0) return json({ code: '23505', message: 'Username is already taken' }, 409);
      return json({ username: request.postDataJSON().p_username });
    }
    if (url.pathname.endsWith('/app_snapshots')) {
      if (method === 'GET' && url.searchParams.get('id') !== 'eq.' + user.user_metadata.account_space_id) return json([]);
      if (method !== 'GET') {
        const payload = request.postDataJSON(), row = Array.isArray(payload) ? payload[0] : payload;
        record.snapshotWrites.push(row);if (row.state) state = row.state;
      }
      return json([{ ...(url.searchParams.get('select') === 'updated_at' ? {} : { state }), updated_at: '2026-10-01T08:00:01.000Z' }]);
    }
    return json([]);
  });
  return { record, user: () => user };
}

export async function openAccountEntry(page, { mode = 'login', size = 16, width = 393, height = 852, query = '' } = {}) {
  await page.setViewportSize({ width, height });
  await page.goto('/' + (size > 16 ? '?dynamic-type-preview=' + size : '') + (query ? (size > 16 ? '&' : '?') + query : ''));
  const gate = page.locator('#public-account-auth-gate');
  await expect(gate).toBeVisible();
  if (mode === 'signup') await gate.locator('[data-account-mode=signup]').click();
  await expect(gate.locator('[data-account-form]')).toHaveAttribute('data-mode', mode === 'reset' ? 'reset-password' : mode === 'complete' ? 'complete-profile' : mode);
  await page.evaluate(() => document.fonts.ready);
  return gate;
}

export async function reachable(control) {
  await expect(control).toBeVisible();
  const result = await control.evaluate(async e => {
    e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { height: r.height, width: r.width, receivesPointer: hit === e || e.contains(hit) };
  });
  expect(result.height).toBeGreaterThanOrEqual(43.5);expect(result.width).toBeGreaterThanOrEqual(43.5);expect(result.receivesPointer).toBe(true);
}

export async function assertAccountLayout(gate, size) {
  const metrics = await gate.evaluate(g => {
    const clipped = [], walker = document.createTreeWalker(g, NodeFilter.SHOW_TEXT);let node, lines = 0;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden=true],.visually-hidden,[hidden],style,script') || !node.parentElement.getClientRects().length) continue;
      const range = document.createRange();range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;lines++;
        if (rect.left < -.75 || rect.right > innerWidth + .75) clipped.push({ text: node.textContent.trim(), left: rect.left, right: rect.right });
      }
    }
    return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), horizontal: g.scrollWidth - g.clientWidth, clipped, lines };
  });
  expect(metrics.root).toBe(size);expect(metrics.horizontal).toBeLessThanOrEqual(1);expect(metrics.clipped).toEqual([]);
  for (const control of await gate.locator('button:enabled,input:not([type=hidden]),a').all()) if (await control.isVisible()) await reachable(control);
  return metrics;
}

export async function fillSignup(gate, { displayName = 'נועם לוי', username = 'noam_levi', email = accountEntryEmail, password = 'SyntheticOnly123!' } = {}) {
  await gate.locator('input[name=displayName]').fill(displayName);await gate.locator('input[name=username]').fill(username);await gate.locator('input[name=email]').fill(email);await gate.locator('input[name=password]').fill(password);
}

export function expectNoExternalFailures(fixture) { expect(fixture.record.external).toEqual([]);expect(fixture.record.pageErrors).toEqual([]); }
