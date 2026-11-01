import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';import{runInNewContext}from'node:vm';
const source=readFileSync(process.env.QA_ACCOUNT_RECOVERY_BACK_SOURCE||new URL('../src/publicAccountAuthLayer.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
function extract(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);const tail=source.slice(start);const end=tail.search(/\n(?:async )?function /);return tail.slice(0,end<0?undefined:end)}
function harness(screen,providers,busy=false){
 const record=[],email='noam@example.test',input={value:email},gate={dataset:{accountRecoveryScreen:screen,accountRecoveryEmail:email}};
 const context={GATE_ID:'gate',authBusy:busy,emailAuthExpanded:true,googleEnabled:providers,appleEnabled:false,
 document:{getElementById:()=>gate,querySelector:s=>s==='[data-account-form]'?(screen==='request'||screen==='login'?{querySelector:s=>s.includes('email')?input:null}:null):s.includes('input[name="email"]')?(screen==='request'||screen==='login'?input:null):null},
 renderAccountGate:v=>record.push(v)};
 runInNewContext(['accountRecoveryEmail','collapseAccountEmailAuth','handleAccountGateKeydown','handleAccountGateNativeBack'].map(extract).join('\n'),context);
 return{record,context,email,back(native){const event={key:'Escape',defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};context[native?'handleAccountGateNativeBack':'handleAccountGateKeydown'](event);return event}};
}
for(const screen of['request','reset-sent','verify'])for(const providers of[false,true])for(const native of[false,true]){
 test(`account ${screen} ${native?'Native Android back':'Escape'} preserves recipient with providers=${providers}`,()=>{
  const h=harness(screen,providers),event=h.back(native);assert.equal(event.defaultPrevented,true,'recovery back must be consumed');assert.equal(h.record.length,1);assert.equal(h.record[0].values.email,h.email,'return must not lose the displayed recipient');assert.equal(h.record[0].mode,'login');assert.equal(h.context.emailAuthExpanded,true,'retained email must remain visible');
 });
}
for(const screen of['request','reset-sent','verify'])test(`busy ${screen} cannot be left by Native back`,()=>{const h=harness(screen,true,true);assert.equal(h.back(true).defaultPrevented,false);assert.equal(h.record.length,0)});
test('ordinary login Escape still collapses providers with the original behavior',()=>{const h=harness('login',true);assert.equal(h.back(false).defaultPrevented,true);assert.equal(h.context.emailAuthExpanded,false);assert.equal(h.record[0].values.email,h.email)});
