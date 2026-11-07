import test from "node:test";
import assert from "node:assert/strict";
import { renderAccountEntryBrandView, renderAccountEntryView } from "../src/ui/accountEntryPresentation.mjs";

const attributes = (text) => Object.fromEntries(
  [...text.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g)]
    .map((match) => [match[1], match[2] ?? match[3] ?? match[4] ?? ""])
);
const input = (html, name) => {
  const tag = html.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`))?.[0];
  assert.ok(tag, `expected rendered ${name} input`);
  return attributes(tag.slice("<input".length, -1));
};
const paragraphs = (html) => [...html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)]
  .map((match) => ({ ...attributes(match[1]), content: match[2] }));
const providerMarkup = '<button type="button" data-account-action="google">Provider</button>';

test("shared brand renders the current original asset and one plain app-name heading", () => {
  const html = renderAccountEntryBrandView();
  assert.match(html, /class="account-auth-brand"/);
  assert.match(html, /src="\.\/app-icon-exterior-192\.png"[^>]*width="50" height="50"/);
  assert.match(html, /<h1>סוגרים חשבון<\/h1>/);
  assert.doesNotMatch(html, /eyebrow|<ul|החשבון נשאר איתך/);
});

test("default email login keeps the original form, email and current-password input semantics", () => {
  const html = renderAccountEntryView();
  assert.match(html, /<h2>כניסה לחשבון<\/h2>/);
  assert.match(html, /<form class="account-auth-form" data-account-form data-mode="login" novalidate>/);
  assert.match(html, /id="account-email-auth" class="account-email-auth" >/);
  assert.deepEqual(input(html, "email"), {
    name: "email", type: "email", inputmode: "email", autocomplete: "email",
    spellcheck: "false", value: "", "aria-invalid": "false", required: ""
  });
  const password = input(html, "password");
  assert.equal(password.type, "password");
  assert.equal(password.autocomplete, "current-password");
  assert.equal(password.minlength, "8");
  assert.ok(Object.hasOwn(password, "required"));
  assert.doesNotMatch(html, /name="(?:displayName|username)"/);
  assert.doesNotMatch(html, /id="public-account-auth-gate"|data-account-action="toggle-email"/);
});

test("provider-first login connects its email toggle to the actual initially hidden email section", () => {
  const html = renderAccountEntryView({ providerAvailable: true, showEmailAuth: false }, { providerMarkup });
  assert.ok(html.indexOf("data-google-auth-slot") < html.indexOf('data-account-action="toggle-email"'));
  assert.match(html, /data-account-action="toggle-email"[\s\S]*?aria-expanded="false"[\s\S]*?aria-controls="account-email-auth"/);
  assert.match(html, /id="account-email-auth" class="account-email-auth" hidden/);
  assert.equal((html.match(/data-google-auth-slot/g) ?? []).length, 1);
  assert.equal((html.match(/data-account-action="google"/g) ?? []).length, 1);
});

test("expanded provider login keeps the collapse action and its matching visibility state", () => {
  const html = renderAccountEntryView({ providerAvailable: true, showEmailAuth: true }, { providerMarkup });
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /חזרה לאפשרויות הכניסה/);
  assert.match(html, /id="account-email-auth" class="account-email-auth" >/);
  assert.doesNotMatch(html, /class="account-email-auth" hidden/);
});

test("signup shows all four original fields before provider alternatives and preserves their constraints", () => {
  const html = renderAccountEntryView({ mode: "signup", emailDeliveryReady: true, providerAvailable: true }, { providerMarkup });
  assert.match(html, /<h2>יצירת חשבון<\/h2>/);
  assert.match(html, /data-mode="signup" novalidate/);
  assert.ok(html.indexOf('name="displayName"') < html.indexOf('name="username"'));
  assert.ok(html.indexOf('name="username"') < html.indexOf('name="email"'));
  assert.ok(html.indexOf('name="email"') < html.indexOf('name="password"'));
  assert.ok(html.indexOf("</form>") < html.indexOf('class="account-entry-alternative"'));
  assert.ok(html.indexOf('class="account-entry-alternative"') < html.indexOf("data-google-auth-slot"));
  assert.ok(html.indexOf("data-google-auth-slot") < html.indexOf('class="account-auth-legal"'));
  assert.equal((html.match(/data-google-auth-slot/g) ?? []).length, 1);
  assert.equal(input(html, "displayName").autocomplete, "name");
  const username = input(html, "username");
  assert.equal(username.dir, "ltr");
  assert.equal(username.autocomplete, "username");
  assert.equal(username.autocapitalize, "none");
  assert.equal(username.spellcheck, "false");
  assert.equal(input(html, "password").autocomplete, "new-password");
  assert.match(html, /אחרי ההרשמה נשלח קישור להפעלת החשבון\./);
  assert.doesNotMatch(html, /data-account-action="forgot-password"|data-account-action="toggle-email"/);
});

test("email-only signup retains the dynamic provider slot without an orphan alternatives label", () => {
  const html = renderAccountEntryView({ mode: "signup", emailDeliveryReady: true, providerAvailable: false });
  assert.match(html, /data-google-auth-slot/);
  assert.ok(html.indexOf("</form>") < html.indexOf("data-google-auth-slot"));
  assert.doesNotMatch(html, /class="account-entry-alternative"/);
});

test("shortened login tab retains the original controller hooks, group and mutually exclusive pressed state", () => {
  for (const mode of ["login", "signup"]) {
    const html = renderAccountEntryView({ mode, emailDeliveryReady: true });
    assert.match(html, /class="account-auth-tabs" role="group" aria-label="כניסה או הרשמה"/);
    assert.match(html, new RegExp(`data-account-mode="login" aria-pressed="${mode === "login"}"[^>]*>כניסה</button>`));
    assert.match(html, new RegExp(`data-account-mode="signup" aria-pressed="${mode === "signup"}"[^>]*>הרשמה</button>`));
    assert.doesNotMatch(html, />התחברות<\/button>/);
  }
});

test("email readiness continues to gate signup, recovery and verification-resend controls", () => {
  const ready = renderAccountEntryView({ emailDeliveryReady: true, showVerificationResend: true });
  assert.match(ready, /data-account-mode="signup"/);
  assert.match(ready, /data-account-action="forgot-password"/);
  assert.match(ready, /data-account-action="resend-verification"/);
  const unavailable = renderAccountEntryView({ emailDeliveryReady: false, showVerificationResend: true });
  assert.doesNotMatch(unavailable, /data-account-mode="signup"|data-account-action="forgot-password"|data-account-action="resend-verification"/);
});

test("invite context keeps escaped event text, trusted invite markup and the original join CTA in both modes", () => {
  const invitation = '<aside class="account-invite-preview">Existing invitation</aside>';
  for (const [mode, label] of [["login", "התחבר והצטרף"], ["signup", "צור חשבון והצטרף"]]) {
    const html = renderAccountEntryView({ mode, emailDeliveryReady: true, hasInvite: true, inviteEventName: '<img src=x onerror="bad"> & חברים' }, { inviteMarkup: invitation });
    assert.ok(html.includes(invitation));
    assert.match(html, /<h2>מצטרפים ל־&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; חברים<\/h2>/);
    assert.match(html, /נכנסים או נרשמים, ומיד ממשיכים לאירוע שקיבלת\./);
    assert.ok(html.indexOf(invitation) < html.indexOf('class="account-auth-heading"'));
    assert.match(html, new RegExp(`class="primary-button account-auth-submit" type="submit">${label}</button>`));
    assert.doesNotMatch(html, /<img src=x/);
  }
});

test("ordinary entry actions keep their original labels and submit button contract", () => {
  for (const [mode, label] of [["login", "התחבר"], ["signup", "צור חשבון"]]) {
    const html = renderAccountEntryView({ mode, emailDeliveryReady: true });
    assert.match(html, new RegExp(`class="primary-button account-auth-submit" type="submit">${label}</button>`));
  }
});

test("rendered field associations resolve to the single error alert while other fields remain valid", () => {
  for (const field of ["displayName", "username", "email", "password"]) {
    const html = renderAccountEntryView({ mode: "signup", emailDeliveryReady: true, error: 'צריך לתקן <ערך>', errorFieldName: field });
    const target = paragraphs(html).filter((p) => p.id === "account-auth-feedback");
    assert.equal(target.length, 1);
    assert.equal(target[0].role, "alert");
    assert.equal(target[0].content, "צריך לתקן &lt;ערך&gt;");
    for (const name of ["displayName", "username", "email", "password"]) {
      const rendered = input(html, name);
      assert.equal(rendered["aria-invalid"], name === field ? "true" : "false");
      assert.equal(rendered["aria-describedby"], name === field ? target[0].id : undefined);
    }
  }
});

test("unsafe error field identifiers cannot inject attributes or bind the wrong control", () => {
  const html = renderAccountEntryView({ error: "Invalid", errorFieldName: 'email" autofocus onfocus="bad' });
  const email = input(html, "email");
  assert.equal(email["aria-invalid"], "false");
  assert.equal(email["aria-describedby"], undefined);
  assert.equal(email.autofocus, undefined);
  assert.equal(email.onfocus, undefined);
});

test("provider errors stay before provider choices with exactly one alert target", () => {
  const html = renderAccountEntryView({ providerAvailable: true, error: "ספק הכניסה לא זמין", providerFeedback: true }, { providerMarkup });
  const alerts = paragraphs(html).filter((p) => p.role === "alert");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, "account-auth-feedback");
  assert.ok(html.indexOf('id="account-auth-feedback"') < html.indexOf("data-google-auth-slot"));
  assert.ok(html.indexOf('id="account-auth-feedback"') < html.indexOf("<form"));
});

test("success and error content keeps distinct live-region targets in every supplied combination", () => {
  for (const providerFeedback of [false, true]) for (const message of ["", "נשלח קישור"]) for (const error of ["", "החיבור נכשל"]) {
    const html = renderAccountEntryView({ emailDeliveryReady: true, providerFeedback, message, error, errorFieldName: error ? "email" : "" });
    const rendered = paragraphs(html), feedback = rendered.filter((p) => p.id === "account-auth-feedback");
    assert.equal(feedback.length, message || error ? 1 : 0);
    if (error) {
      assert.equal(feedback[0].role, "alert");
      assert.equal(feedback[0].content, error);
      assert.equal(input(html, "email")["aria-describedby"], feedback[0].id);
    } else if (message) {
      assert.equal(feedback[0].role, "status");
      assert.equal(feedback[0].content, message);
    }
    if (message) {
      const status = rendered.find((p) => p.role === "status" && p.content === message);
      assert.ok(status);
      assert.equal(status.id, error ? "account-auth-message" : "account-auth-feedback");
    }
  }
});

test("input drafts and feedback are escaped without emitting secret password values or injected attributes", () => {
  const dirty='" autofocus onfocus="bad`<&\'';
  const values=Object.freeze({displayName:dirty,username:dirty,email:dirty,password:"never-render-this-secret"});
  const model=Object.freeze({mode:"signup",emailDeliveryReady:true,values,message:"<script>status</script>",error:"<script>alert</script>",errorFieldName:"email"});
  const html=renderAccountEntryView(model);
  for (const name of ["displayName","username","email"]) {
    const field=input(html,name);
    assert.equal(field.value,'&quot; autofocus onfocus=&quot;bad&#096;&lt;&amp;&#039;');
    assert.equal(field.autofocus,undefined);
    assert.equal(field.onfocus,undefined);
  }
  assert.equal(input(html,"password").value,undefined);
  assert.doesNotMatch(html,/never-render-this-secret|<script>/);
  assert.match(html,/&lt;script&gt;status&lt;\/script&gt;/);
  assert.match(html,/&lt;script&gt;alert&lt;\/script&gt;/);
  assert.equal(values.email,dirty);
});

test("password visibility and legal navigation retain their original accessible hooks", () => {
  const html=renderAccountEntryView();
  assert.match(html,/class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false"/);
  assert.match(html,/<a href="\.\/terms\.html">תנאי השימוש<\/a>/);
  assert.match(html,/<a href="\.\/privacy\.html">מדיניות הפרטיות<\/a>/);
  assert.match(html,/data-account-auth-status role="status" aria-live="polite"/);
});

test("explicit display visibility and supplied values do not get recalculated or mutated by the pure renderer", () => {
  const model=Object.freeze({providerAvailable:true,showEmailAuth:false,values:Object.freeze({email:"qa@example.invalid"})});
  const html=renderAccountEntryView(model);
  assert.match(html,/class="account-email-auth" hidden/);
  assert.equal(input(html,"email").value,"qa@example.invalid");
  assert.equal(model.showEmailAuth,false);
  assert.equal(model.values.email,"qa@example.invalid");
});
