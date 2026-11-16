import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(process.env.QA_ACCOUNT_RECOVERY_SOURCE||new URL('../src/publicAccountAuthLayer.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
function extract(name){const start=source.indexOf(`function ${name}(`);if(start<0)return'';const tail=source.slice(start);const end=tail.search(/\n(?:async )?function /);return tail.slice(0,end<0?undefined:end).replace(/^function /,source.slice(Math.max(0,start-6),start)==='async '?'async function ':'function ')}
function harness({email=' Noam@Example.test ',screen='request',ready=true,reject=false,flowSaved=true,hold=null}={}){
 const record={views:[],requests:[],flows:[],cleared:[],busy:[],returns:0,legacy:[]};let busy=false;
 const input={value:email},gate={dataset:{accountRecoveryScreen:screen,accountRecoveryEmail:email}};
 const context={GATE_ID:'public-account-auth-gate',runtimeConfig:{launch:{authEmailDeliveryReady:ready}},ACCOUNT_RECOVERY_FLOW_PURPOSE:'password-recovery',
 document:{querySelector:s=>s.includes('input[name="email"]')?input:null,getElementById:()=>gate},
 normalizeAccountEmail:v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)?v:'',
 setAuthBusy:v=>{busy=v;record.busy.push(v)},clearAccountRecoverySession:()=>{},rememberAccountReturnUrl:()=>record.returns++,
 createOAuthPkce:async()=>({verifier:'synthetic-verifier',challenge:'synthetic-challenge'}),createAccountOAuthFlowId:()=> 'synthetic-flow-id',
 saveAccountOAuthFlow:v=>{record.flows.push(v);return flowSaved?v:null},accountReturnPath:()=> '/?event=synthetic-invite',authRedirectUrl:id=>'https://app.example.test/?account-flow='+id,
 requestPasswordReset:async(config,address,redirect)=>{record.requests.push({address,redirect});if(hold)await hold;if(reject)throw Error('delivery outage')},
 clearAccountOAuthFlow:id=>record.cleared.push(id),emitOperationFailure:()=>{},accountAuthErrorMessage:()=> 'שגיאת שליחה',
 renderAccountRecoveryScreen:v=>record.views.push(v),renderAccountGate:v=>record.legacy.push(v),focusAccountInput:()=>{},emailAuthExpanded:false};
 Object.defineProperty(context,'authBusy',{get:()=>busy});
 runInNewContext(['accountRecoveryEmail','sendAccountPasswordReset','handleAccountRecoverySubmit','handleAccountClick'].map(extract).join('\n'),context);
 return {record,context,send:()=>context.sendAccountPasswordReset(),click:action=>context.handleAccountClick({target:{closest:s=>s==='[data-account-action]'?{dataset:{accountAction:action}}:null}})};
}
test('opening password recovery never sends a request before explicit confirmation',async()=>{
 const h=harness();await h.click('forgot-password');assert.equal(h.record.requests.length,0,'opening the screen must not send an email');assert.equal(h.record.views[0].screen,'request');assert.equal(h.record.views[0].email,' Noam@Example.test ');
});
test('password recovery normalizes the actual delivery request and keeps the exact bound PKCE flow',async()=>{
 const h=harness();await h.send();assert.deepEqual(h.record.requests,[{address:'noam@example.test',redirect:'https://app.example.test/?account-flow=synthetic-flow-id'}]);
 assert.deepEqual(JSON.parse(JSON.stringify(h.record.flows)),[{id:'synthetic-flow-id',verifier:'synthetic-verifier',returnPath:'/?event=synthetic-invite',purpose:'password-recovery',email:'noam@example.test'}]);assert.equal(h.record.views.at(-1).screen,'reset-sent');assert.deepEqual(h.record.busy,[true,false]);
});
for(const email of['','invalid@example'])test(`password recovery invalid email ${JSON.stringify(email)} stays editable and never calls delivery`,async()=>{
 const h=harness({email});await h.send();assert.equal(h.record.requests.length,0);assert.equal(h.record.flows.length,0);assert.equal(h.record.views.at(-1).errorFieldName,'email');assert.equal(h.record.views.at(-1).email,email);
});
test('rejected initial delivery clears only its saved flow, retains email and never reports success',async()=>{
 const h=harness({reject:true});await h.send();assert.deepEqual(h.record.cleared,['synthetic-flow-id']);assert.equal(h.record.views.at(-1).screen,'request');assert.equal(h.record.views.at(-1).email,'noam@example.test');assert.equal(h.record.views.at(-1).error,'שגיאת שליחה');assert.equal(h.record.views.at(-1).message,undefined);assert.deepEqual(h.record.busy,[true,false]);
});
test('rejected resend stays on the sent screen with a retryable alert and same recipient',async()=>{
 const h=harness({screen:'reset-sent',reject:true});await h.send();assert.equal(h.record.views.at(-1).screen,'reset-sent');assert.equal(h.record.views.at(-1).error,'שגיאת שליחה');assert.equal(h.record.requests.length,1);
});
test('unavailable secure flow never sends an email or claims delivery',async()=>{
 const h=harness({flowSaved:false});await h.send();assert.equal(h.record.requests.length,0);assert.equal(h.record.views.at(-1).screen,'request');assert.ok(h.record.views.at(-1).error);
});
test('in-flight reset request cannot send a duplicate from a second submit or resend click',async()=>{
 let release;const hold=new Promise(r=>release=r);const h=harness({hold});const first=h.send();await h.send();await h.click('resend-password-reset');release();await first;assert.equal(h.record.requests.length,1);assert.equal(h.record.flows.length,1);
});
test('delivery readiness blocks initial and resend requests without allocating a flow',async()=>{
 const h=harness({ready:false});await h.click('forgot-password');await h.send();await h.click('resend-password-reset');assert.equal(h.record.requests.length,0);assert.equal(h.record.flows.length,0);assert.equal(h.record.views.length,0);
});
test('a successful resend uses the same protocol and announces its acknowledgement',async()=>{
 const h=harness({screen:'reset-sent'});await h.send();assert.equal(h.record.views.at(-1).screen,'reset-sent');assert.match(h.record.views.at(-1).message,/נשלח קישור איפוס חדש/);assert.equal(h.record.requests.length,1);
});
test('return to login retains email without clearing recovery or allocating another flow',async()=>{
 const h=harness({screen:'verify'});await h.click('recovery-login');assert.equal(h.record.legacy.at(-1).values.email,' Noam@Example.test ');assert.equal(h.record.requests.length,0);assert.equal(h.record.flows.length,0);assert.equal(h.record.cleared.length,0);
});
