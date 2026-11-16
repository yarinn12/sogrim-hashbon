import test from "node:test";
import assert from "node:assert/strict";
import {renderAccountPasswordResetView} from "../src/ui/accountPasswordResetPresentation.mjs";

test("password reset presents the approved single heading and original submit flow", () => {
  const html = renderAccountPasswordResetView();
  assert.match(html, /class="account-auth-shell account-auth-shell-compact"/);
  assert.match(html, /<h2>סיסמה חדשה<\/h2>/);
  assert.match(html, /<p>לפחות 8 תווים\.<\/p>/);
  assert.match(html, /data-account-form data-mode="reset-password" novalidate/);
  assert.match(html, /class="primary-button account-auth-submit" type="submit">שמור סיסמה/);
  assert.doesNotMatch(html, /data-account-mode|account-auth-legal|<h2>איפוס סיסמה/);
});

test("password reset retains both credential fields and browser password-manager attributes", () => {
  const html = renderAccountPasswordResetView();
  for (const name of ["password", "passwordConfirmation"]) {
    assert.match(html, new RegExp(`name="${name}" type="password" autocomplete="new-password" minlength="8" required`));
  }
  assert.equal((html.match(/<input /g) ?? []).length, 2);
  assert.match(html, /<span>סיסמה חדשה<\/span>/);
  assert.match(html, /<span>אימות סיסמה<\/span>/);
});

test("each password reset field keeps a non-submitting reveal action with an accessible name", () => {
  const html = renderAccountPasswordResetView();
  const controls = [...html.matchAll(/<button class="account-password-toggle"([^>]+)>/g)];
  assert.equal(controls.length, 2);
  for (const [, attributes] of controls) {
    assert.match(attributes, /type="button"/);
    assert.match(attributes, /data-account-action="toggle-password"/);
    assert.match(attributes, /aria-label="הצג סיסמה" aria-pressed="false"/);
  }
  assert.equal((html.match(/class="account-password-input"/g) ?? []).length, 2);
});

test("password reset exposes one escaped alert without altering credential values", () => {
  const html = renderAccountPasswordResetView({error: `</p><script>alert("x")</script> & 'reason'`});
  assert.match(html, /id="account-auth-feedback" class="account-auth-error" role="alert"/);
  assert.match(html, /&lt;\/p&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#039;reason&#039;/);
  assert.doesNotMatch(html, /<script>|<input[^>]*value=/);
  assert.equal((html.match(/id="account-auth-feedback"/g) ?? []).length, 1);
});

test("password reset keeps polite background status and omits an empty error", () => {
  const html = renderAccountPasswordResetView();
  assert.match(html, /data-account-auth-status role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /id="account-auth-feedback"|role="alert"/);
});
