import { expect, test } from '@playwright/test';
import { accountEntryAuthOrigin, accountEntryEmail, accountEntryUserId, prepareAccountEntry, openAccountEntry, assertAccountLayout, reachable, fillSignup, expectNoExternalFailures } from './helpers/accountEntryBatchPresentation.mjs';

test.use({ serviceWorkers: 'block' });

test('account entry: normal login keeps labelled fields and the approved heading reachable', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page);
  await expect(gate).toHaveClass(/account-entry-screen/);await expect(gate.getByRole('heading', { name: 'כניסה לחשבון', exact: true })).toBeVisible();
  await expect(gate.locator('input[name=email]')).toHaveAttribute('autocomplete', 'email');await expect(gate.locator('input[name=password]')).toHaveAttribute('autocomplete', 'current-password');
  await assertAccountLayout(gate, 16);expectNoExternalFailures(fixture);
});

test('account entry regression: narrow enlarged signup tab remains one whole word', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { mode: 'signup', size: 32, width: 320 });
  const lines = await gate.locator('[data-account-mode=login]').evaluate(button => { const range = document.createRange();range.selectNodeContents(button);return [...new Set([...range.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top)))].length; });
  expect(lines).toBe(1);expectNoExternalFailures(fixture);
});

test('account entry regression: signup verification explanation scales with 32px system text', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL);let gate = await openAccountEntry(page, { mode: 'signup' });
  const normal = await gate.locator('.account-auth-field-hint').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  gate = await openAccountEntry(page, { mode: 'signup', size: 32, width: 320 });
  const large = await gate.locator('.account-auth-field-hint').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  expect(large / normal).toBeGreaterThanOrEqual(1.8);expect(large).toBeGreaterThanOrEqual(25);expectNoExternalFailures(fixture);
});

test('account entry regression: legal links retain 44px reachable targets', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page);
  await expect(gate.locator('.account-auth-legal a')).toHaveCount(2);
  for (const link of await gate.locator('.account-auth-legal a').all()) await reachable(link);
  expectNoExternalFailures(fixture);
});

test('account entry: enlarged short login scrolls to fields, submit and legal links', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { size: 32, width: 320, height: 568 });
  await assertAccountLayout(gate, 32);expectNoExternalFailures(fixture);
});

test('account entry: enlarged landscape signup preserves form order and tab state', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { mode: 'signup', size: 32, width: 844, height: 390 });
  await expect(gate.getByRole('heading', { name: 'יצירת חשבון', exact: true })).toBeVisible();await expect(gate.locator('[data-account-mode=signup]')).toHaveAttribute('aria-pressed', 'true');
  expect(await gate.locator('input:not([type=hidden])').evaluateAll(es => es.map(e => e.name))).toEqual(['displayName', 'username', 'email', 'password']);
  await assertAccountLayout(gate, 32);expectNoExternalFailures(fixture);
});

test('account entry: keyboard submit binds validation to the password and its reveal control', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page);
  await gate.locator('input[name=email]').fill(accountEntryEmail);await gate.locator('input[name=password]').fill('short');await gate.locator('input[name=password]').press('Enter');
  const password = gate.locator('input[name=password]');await expect(password).toBeFocused();await expect(password).toHaveAttribute('aria-invalid', 'true');await expect(password).toHaveAttribute('aria-describedby', 'account-auth-feedback');
  await expect(gate.locator('#account-auth-feedback')).toHaveRole('alert');await expect(gate.locator('#account-auth-feedback')).toContainText('לפחות 8 תווים');
  await password.press('Tab');await expect(gate.locator('.account-password-toggle')).toBeFocused();await gate.locator('.account-password-toggle').press('Enter');await expect(password).toHaveAttribute('type', 'text');
  expect(fixture.record.passwords).toHaveLength(0);expectNoExternalFailures(fixture);
});

test('account entry: signup validates missing full name locally without a request', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { mode: 'signup', size: 32, width: 320 });
  await gate.locator('input[name=email]').fill(accountEntryEmail);await gate.getByRole('button', { name: 'צור חשבון', exact: true }).click();
  await expect(gate.locator('#account-auth-feedback')).toContainText('שם פרטי ושם משפחה');await expect(gate.locator('input[name=displayName]')).toBeFocused();await expect(gate.locator('input[name=displayName]')).toHaveAttribute('aria-invalid', 'true');
  expect(fixture.record.signup).toHaveLength(0);expectNoExternalFailures(fixture);
});

test('account entry: successful signup sends normalized identity and waits for email verification', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { mode: 'signup' });
  await fillSignup(gate, { username: 'NOAM_LEVI', email: ' Account-Entry@Example.com ' });await gate.getByRole('button', { name: 'צור חשבון', exact: true }).click();
  await expect(gate.locator('#account-auth-feedback')).toHaveRole('status');await expect(gate.locator('#account-auth-feedback')).toContainText('קישור לאישור המייל');
  expect(fixture.record.signup).toHaveLength(1);const { payload, redirect } = fixture.record.signup[0];
  expect(payload.email).toBe(accountEntryEmail);expect(payload.password).toBe('SyntheticOnly123!');expect(payload.data).toMatchObject({ full_name: 'נועם לוי', username: 'noam_levi' });expect(payload.data.account_space_id).toBeTruthy();expect(payload.data.account_space_key.length).toBeGreaterThanOrEqual(32);expect(new URL(redirect).origin).toBe(new URL(baseURL).origin);
  expect(await page.evaluate(() => localStorage.getItem('settle-friends-account-session'))).toBeNull();await expect(gate.locator('[data-account-action=resend-verification]')).toBeVisible();expectNoExternalFailures(fixture);
});

test('account entry: rejected signup retains identity fields with an alert and no accepted session', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { rejectSignup: true }), gate = await openAccountEntry(page, { mode: 'signup' });
  await fillSignup(gate);await gate.getByRole('button', { name: 'צור חשבון', exact: true }).click();await expect(gate.locator('#account-auth-feedback')).toHaveRole('alert');
  await expect(gate.locator('input[name=displayName]')).toHaveValue('נועם לוי');await expect(gate.locator('input[name=username]')).toHaveValue('noam_levi');await expect(gate.locator('input[name=email]')).toHaveValue(accountEntryEmail);
  expect(fixture.record.signup).toHaveLength(1);expect(await page.evaluate(() => localStorage.getItem('settle-friends-account-session'))).toBeNull();expectNoExternalFailures(fixture);
});

test('account entry: password recovery validates, normalizes and announces the synthetic email result', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { size: 32, width: 320, height: 568 });
  await gate.locator('[data-account-action=forgot-password]').click();await expect(gate.locator('#account-auth-feedback')).toHaveRole('alert');await expect(gate.locator('input[name=email]')).toBeFocused();
  await gate.locator('input[name=email]').fill('invalid@example');await gate.locator('[data-account-action=forgot-password]').click();await expect(gate.locator('#account-auth-feedback')).toContainText('אינה תקינה');expect(fixture.record.recover).toHaveLength(0);
  await gate.locator('input[name=email]').fill(' Account-Entry@Example.com ');await gate.locator('[data-account-action=forgot-password]').click();
  await expect(gate.locator('#account-auth-feedback')).toHaveRole('status');await expect(gate.locator('#account-auth-feedback')).toContainText('שלחנו קישור לאיפוס הסיסמה');
  expect(fixture.record.recover).toHaveLength(1);expect(fixture.record.recover[0].payload).toEqual({ email: accountEntryEmail });expect(new URL(fixture.record.recover[0].redirect).origin).toBe(new URL(baseURL).origin);await expect(gate.locator('#account-auth-feedback')).toBeInViewport();
  expectNoExternalFailures(fixture);
});

test('account entry: login rejection can retry the final password request without duplicate submission', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { acceptLogin: true, rejectLoginOnce: true }), gate = await openAccountEntry(page);
  for (let attempt = 0; attempt < 2; attempt++) {
    await gate.locator('input[name=email]').fill(accountEntryEmail);await gate.locator('input[name=password]').fill('SyntheticOnly123!');await gate.getByRole('button', { name: 'התחבר', exact: true }).click();
    if (!attempt) { await expect(gate.locator('#account-auth-feedback')).toHaveRole('alert');await expect(gate.locator('#account-auth-feedback')).toContainText('האימייל או הסיסמה אינם נכונים'); }
  }
  await expect(gate).toHaveCount(0, { timeout: 20000 });await expect(page.getByText('אירוע בדיקת החשבון', { exact: true })).toBeVisible();
  expect(fixture.record.passwords).toEqual([{ payload: { email: accountEntryEmail, password: 'SyntheticOnly123!' }, grant: 'password' }, { payload: { email: accountEntryEmail, password: 'SyntheticOnly123!' }, grant: 'password' }]);expectNoExternalFailures(fixture);
});

test('account entry: authenticated recovery keeps the new-password gate across reload and rotation', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { recovery: true }), gate = await openAccountEntry(page, { mode: 'reset', size: 32, width: 320 });
  await expect(gate.getByRole('heading', { name: 'סיסמה חדשה', exact: true })).toBeVisible();await assertAccountLayout(gate, 32);await page.reload();await expect(gate.locator('form')).toHaveAttribute('data-mode', 'reset-password');
  await page.setViewportSize({ width: 844, height: 390 });await assertAccountLayout(gate, 32);expect(fixture.record.userUpdates).toHaveLength(0);expectNoExternalFailures(fixture);
});

test('account entry: password mismatch and reveal stay local without clearing recovery', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { recovery: true }), gate = await openAccountEntry(page, { mode: 'reset', size: 32, width: 320 });
  await gate.locator('input[name=password]').fill('SyntheticOnly123!');await gate.locator('input[name=passwordConfirmation]').fill('DifferentSynthetic123!');await gate.getByRole('button', { name: 'שמור סיסמה', exact: true }).click();
  await expect(gate.locator('#account-auth-feedback')).toContainText('הסיסמאות אינן זהות');await expect(gate.locator('input[name=passwordConfirmation]')).toBeFocused();
  const confirmation = gate.locator('input[name=passwordConfirmation]');await confirmation.fill('SyntheticOnly123!');const toggle = confirmation.locator('..').getByRole('button');await toggle.click();await expect(confirmation).toHaveAttribute('type', 'text');await expect(toggle).toHaveAttribute('aria-pressed', 'true');await toggle.click();await expect(confirmation).toHaveAttribute('type', 'password');
  expect(fixture.record.userUpdates).toHaveLength(0);expect(await page.evaluate(() => JSON.parse(localStorage.getItem('settle-friends-account-recovery-session'))?.userId)).toBe(accountEntryUserId);expectNoExternalFailures(fixture);
});

test('account entry: password-update rejection preserves recovery and an acknowledged retry clears it', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { recovery: true, failUserWriteOnce: true }), gate = await openAccountEntry(page, { mode: 'reset' });
  for (let attempt = 0; attempt < 2; attempt++) {
    await gate.locator('input[name=password]').fill('SyntheticOnly123!');await gate.locator('input[name=passwordConfirmation]').fill('SyntheticOnly123!');await gate.getByRole('button', { name: 'שמור סיסמה', exact: true }).click();
    if (!attempt) { await expect(gate.locator('#account-auth-feedback')).toHaveRole('alert');expect(await page.evaluate(() => Boolean(localStorage.getItem('settle-friends-account-recovery-session')))).toBe(true); }
  }
  await expect(gate).toHaveCount(0, { timeout: 20000 });expect(fixture.record.userUpdates).toHaveLength(2);for (const request of fixture.record.userUpdates) { expect(request.payload).toEqual({ password: 'SyntheticOnly123!' });expect(request.authorization).toBe('Bearer synthetic-account-entry-access'); }
  expect(await page.evaluate(() => localStorage.getItem('settle-friends-account-recovery-session'))).toBeNull();expectNoExternalFailures(fixture);
});

test('account entry: incomplete name requires both identity fields and submits exact normalized metadata', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { authenticated: true, incompleteName: true, incompleteUsername: true }), gate = await openAccountEntry(page, { mode: 'complete', size: 32, width: 320 });
  await expect(gate.getByRole('heading', { name: 'השלמת פרטים', exact: true })).toBeVisible();await assertAccountLayout(gate, 32);
  await gate.getByRole('button', { name: 'שמור והמשך', exact: true }).click();await expect(gate.locator('#account-auth-feedback')).toContainText('שם פרטי ושם משפחה');expect(fixture.record.userUpdates).toHaveLength(0);
  await gate.locator('input[name=displayName]').fill('נועם לוי');await gate.locator('input[name=username]').fill('NOAM_LEVI');await gate.getByRole('button', { name: 'שמור והמשך', exact: true }).click();await expect(gate).toHaveCount(0, { timeout: 20000 });
  expect(fixture.record.username[0]).toEqual({ p_username: 'noam_levi' });expect(fixture.record.userUpdates[0].payload).toEqual({ data: { full_name: 'נועם לוי', name: 'נועם לוי', display_name: 'נועם לוי', username: 'noam_levi', account_space_id: 'space-account-entry', account_space_key: 'abcdefghijklmnopqrstuvwxyzABCDEF' } });expectNoExternalFailures(fixture);
});

test('account entry: known full name is preserved in a hidden field and another account can be chosen', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { authenticated: true, incompleteUsername: true }), gate = await openAccountEntry(page, { mode: 'complete', size: 32, width: 320, height: 568 });
  await expect(gate.locator('input[name=displayName]')).toHaveAttribute('type', 'hidden');await expect(gate.locator('input[name=displayName]')).toHaveValue('נועם לוי');await expect(gate.locator('input[name=username]')).toBeFocused();await assertAccountLayout(gate, 32);
  await gate.locator('[data-account-action=signout]').click();await expect(gate.locator('form')).toHaveAttribute('data-mode', 'login');expect(await page.evaluate(() => localStorage.getItem('settle-friends-account-session'))).toBeNull();expectNoExternalFailures(fixture);
});

test('account entry regression: username collision remains clear and preserves the typed completion fields', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL, { authenticated: true, incompleteName: true, incompleteUsername: true, usernameCollisionOnce: true }), gate = await openAccountEntry(page, { mode: 'complete' });
  await gate.locator('input[name=displayName]').fill('נועם לוי');await gate.locator('input[name=username]').fill('taken_name');await gate.getByRole('button', { name: 'שמור והמשך', exact: true }).click();
  await expect(gate.locator('#account-auth-feedback')).toHaveRole('alert');await expect(gate.locator('#account-auth-feedback')).toContainText('שם המשתמש הזה כבר תפוס');await expect(gate.locator('input[name=displayName]')).toHaveValue('נועם לוי');await expect(gate.locator('input[name=username]')).toHaveValue('taken_name');await expect(gate.locator('input[name=username]')).toBeFocused();expect(fixture.record.userUpdates).toHaveLength(0);
  await gate.locator('input[name=username]').fill('available_name');await gate.getByRole('button', { name: 'שמור והמשך', exact: true }).click();await expect(gate).toHaveCount(0, { timeout: 20000 });expect(fixture.record.username.slice(0, 2)).toEqual([{ p_username: 'taken_name' }, { p_username: 'available_name' }]);expectNoExternalFailures(fixture);
});

test('account entry: an incoming event invitation survives switching between login and signup', async ({ page, baseURL }) => {
  const fixture = await prepareAccountEntry(page, baseURL), gate = await openAccountEntry(page, { query: 'event=synthetic-invitation' });
  await expect(gate.locator('.account-invite-preview')).toBeVisible();await expect(gate.locator('.account-auth-heading')).toContainText('מצטרפים ל־האירוע שקיבלת');await expect(gate.getByRole('button', { name: 'התחבר והצטרף', exact: true })).toBeVisible();
  await gate.locator('[data-account-mode=signup]').click();await expect(gate.getByRole('button', { name: 'צור חשבון והצטרף', exact: true })).toBeVisible();await gate.locator('[data-account-mode=login]').click();await expect(gate.locator('.account-invite-preview')).toBeVisible();expect(fixture.record.passwords).toHaveLength(0);expectNoExternalFailures(fixture);
});

test('account entry: late native provider discovery retains typed email and signup keeps providers after the form', async ({ page, baseURL }) => {
  let release;const holdProviders = new Promise(resolve => { release = resolve; });
  const fixture = await prepareAccountEntry(page, baseURL, { nativeProviders: true, holdProviders });let gate;
  try { gate = await openAccountEntry(page);await gate.locator('input[name=email]').fill(accountEntryEmail); } finally { release(); }
  await expect(gate.locator('[data-account-action=apple]')).toBeVisible();await expect(gate.locator('[data-account-action=google]')).toBeVisible();await expect(gate.locator('input[name=email]')).toHaveValue(accountEntryEmail);
  await gate.locator('[data-account-mode=signup]').click();expect(await gate.locator('[data-google-auth-slot]').evaluate(slot => Boolean(slot.compareDocumentPosition(document.querySelector('[data-account-form]')) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  await gate.locator('[data-account-mode=login]').click();await gate.locator('[data-account-action=toggle-email]').click();await expect(gate.locator('#account-email-auth')).toBeHidden();await gate.getByRole('button', { name: 'המשך עם Apple', exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__accountEntryNativeOpened.length)).toBe(1);const url = new URL(await page.evaluate(() => globalThis.__accountEntryNativeOpened[0]));expect(url.origin).toBe(accountEntryAuthOrigin);expect(url.searchParams.get('provider')).toBe('apple');expect(url.searchParams.get('code_challenge_method')).toBe('s256');expectNoExternalFailures(fixture);
});
