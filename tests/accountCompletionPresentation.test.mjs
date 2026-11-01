import test from "node:test";
import assert from "node:assert/strict";
import {renderAccountCompletionView} from "../src/ui/accountCompletionPresentation.mjs";

test("account completion keeps its original form mode, actions and live status", () => {
  const html = renderAccountCompletionView();
  assert.match(html, /class="account-auth-shell account-auth-shell-compact"/);
  assert.match(html, /<h2>השלמת פרטים<\/h2>/);
  assert.match(html, /כדי שחברים יוכלו לזהות ולמצוא אותך\./);
  assert.match(html, /data-account-form data-mode="complete-profile" novalidate/);
  assert.match(html, /type="submit">שמור והמשך<\/button>/);
  assert.match(html, /type="button" data-account-action="signout">כניסה עם חשבון אחר/);
  assert.match(html, /data-account-auth-status role="status" aria-live="polite"/);
});

test("account completion preserves both identity fields when the adapter says the name is missing", () => {
  const html = renderAccountCompletionView({displayName: "נועם", username: "noam", hasSavedFullName: false});
  assert.match(html, /<span>שם פרטי ושם משפחה<\/span>/);
  assert.match(html, /name="displayName" autocomplete="name" value="נועם"/);
  assert.doesNotMatch(html, /name="displayName" type="hidden"/);
  assert.match(html, /name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" value="noam"\s+required/);
});

test("account completion preserves the saved name as one hidden input and only asks for username", () => {
  const html = renderAccountCompletionView({displayName: "נועם לוי", username: "noam_levi", hasSavedFullName: true});
  assert.match(html, /<input name="displayName" type="hidden" value="נועם לוי" \/>/);
  assert.equal((html.match(/name="displayName"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<span>שם פרטי ושם משפחה<\/span>/);
  assert.match(html, /name="username"[^>]*value="noam_levi"/);
});

test("account completion takes saved-name eligibility from its adapter instead of inferring it", () => {
  const hidden = renderAccountCompletionView({displayName: "", hasSavedFullName: true});
  const visible = renderAccountCompletionView({displayName: "נועם לוי", hasSavedFullName: false});
  assert.match(hidden, /name="displayName" type="hidden"/);
  assert.match(visible, /name="displayName" autocomplete="name"/);
});

test("account completion keeps invitation continuation context instead of the generic explanation", () => {
  const html = renderAccountCompletionView({hasInvite: true});
  assert.match(html, /אחרי השמירה נמשיך אוטומטית לאירוע מהקישור\./);
  assert.doesNotMatch(html, /כדי שחברים יוכלו לזהות ולמצוא אותך/);
});

test("account completion escapes visible and hidden identity values and error text", () => {
  const value = `\"><img src=x onerror=alert(1)> & ' \``;
  for (const hasSavedFullName of [false, true]) {
    const html = renderAccountCompletionView({displayName: value, username: value, error: value, hasSavedFullName});
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt; &amp; &#039; &#096;/);
    assert.match(html, /role="alert">&quot;&gt;&lt;img/);
    assert.equal((html.match(/id="account-auth-feedback"/g) ?? []).length, 1);
  }
});

test("account completion binds the original username validation error to its feedback", () => {
  const html = renderAccountCompletionView({error: "שם המשתמש כבר תפוס", errorFieldName: "username"});
  assert.match(html, /name="username"[^>]*aria-invalid="true" aria-describedby="account-auth-feedback"/);
  assert.match(html, /id="account-auth-feedback" class="account-auth-error" role="alert">שם המשתמש כבר תפוס/);
});

test("account completion ignores unsupported or injected error-field names", () => {
  for (const errorFieldName of ["email", 'username" autofocus onfocus="alert(1)']) {
    const html = renderAccountCompletionView({error: "פרטים לא תקינים", errorFieldName});
    assert.doesNotMatch(html, /aria-invalid="true"|autofocus|onfocus=/);
    assert.match(html, /role="alert">פרטים לא תקינים/);
  }
  assert.doesNotMatch(renderAccountCompletionView(), /id="account-auth-feedback"|role="alert"/);
});
