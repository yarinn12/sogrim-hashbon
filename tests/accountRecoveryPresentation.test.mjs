import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAccountRecoveryView as view } from '../src/ui/accountRecoveryPresentation.mjs';
for (const screen of ['request','reset-sent','verify','connection']) {
 test(`account recovery ${screen}: shares the approved brand, scoped heading and flat structure`,()=>{
  const html=view({screen,email:'noam@example.test',deliveryReady:true,signInPending:true});
  assert.match(html,/app-icon-exterior-192.png/);assert.match(html,/account-auth-heading/);
  assert.equal((html.match(/id="account-recovery-title"/g)||[]).length,1);
  assert.doesNotMatch(html,/account-google-slot|account-auth-tabs|type="password"|eyebrow/);
 });
}
test('account reset request is a real email form with a submit button and safe validation association',()=>{
 const html=view({screen:'request',email:'"<script>alert(1)</script>',deliveryReady:true,error:'האימייל שגוי',errorFieldName:'email'});
 assert.match(html,/data-mode="request-password-reset" novalidate/);assert.match(html,/name="email" type="email" dir="ltr"/);
 assert.match(html,/aria-invalid="true" aria-describedby="account-auth-feedback"/);assert.match(html,/role="alert"/);
 assert.match(html,/type="submit">שלח קישור לאיפוס/);assert.doesNotMatch(html,/<script>/);
});
for(const screen of ['request','reset-sent','verify'])test(`account recovery ${screen}: delivery readiness gates every email action`,()=>{
 const html=view({screen,deliveryReady:false});assert.doesNotMatch(html,/type="submit"|data-account-action="resend/);
 assert.match(html,/data-account-action="recovery-login"/);
});
for(const screen of ['reset-sent','verify'])test(`account recovery ${screen}: recipient is readable, isolated and escaped`,()=>{
 const html=view({screen,email:'long.address+review@example.test<img>',deliveryReady:true});
 assert.match(html,/dir="ltr">long.address\+review@example.test&lt;img&gt;/);
 assert.doesNotMatch(html,/<input|data-account-form/);assert.match(html,/data-account-action="resend-/);
});
test('account connection delay distinguishes accepted credentials from unknown config failure',()=>{
 const accepted=view({screen:'connection',signInPending:true});const unknown=view({screen:'connection'});
 assert.match(accepted,/פתיחת החשבון מתעכבת/);assert.match(accepted,/הכניסה הצליחה/);assert.match(accepted,/data-account-retry/);
 assert.match(unknown,/החיבור מתעכב/);assert.doesNotMatch(unknown,/הכניסה הצליחה/);
});
test('connecting still has live status and no active retry/back action',()=>{
 const html=view({screen:'connection',connecting:true,signInPending:true});assert.match(html,/פותחים את החשבון/);
 assert.match(html,/role="status" aria-live="polite"/);assert.doesNotMatch(html,/data-account-retry|recovery-login/);
});
test('invitation context remains before the recovery heading',()=>{
 const html=view({screen:'request'},{inviteMarkup:'<section class="account-invite-preview">טיול</section>'});
 assert.ok(html.indexOf('account-invite-preview')<html.indexOf('account-auth-heading'));
});
test('error takes precedence over status with one unique feedback association',()=>{
 const html=view({screen:'verify',error:'<failure>',message:'success'});assert.equal((html.match(/id="account-auth-feedback"/g)||[]).length,1);
 assert.match(html,/role="alert">&lt;failure&gt;/);assert.doesNotMatch(html,/success/);
});
test('a transient resend message is announced without decorating the recipient',()=>{
 const html=view({screen:'reset-sent',message:'נשלח קישור חדש',email:'noam@example.test'});assert.match(html,/role="status">נשלח קישור חדש/);assert.doesNotMatch(html,/account-auth-message/);
});
test('unknown screen cannot silently impersonate a completed operation',()=>assert.throws(()=>view({screen:'unknown'}),RangeError));
