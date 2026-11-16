import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(process.env.ACCOUNT_RECOVERY_FOCUS_SOURCE || new URL('../src/publicAccountAuthLayer.mjs',import.meta.url),'utf8');
const start=source.indexOf('function renderAccountRecoveryScreen(');
const end=source.indexOf('\nasync function handleAccountRecoverySubmit',start);
assert.ok(start>=0 && end>start);

function harness(){
 let pending, current, titleFocus=0;
 const body={append(g){current=g},},root={};
 const document={body,documentElement:root,activeElement:body,
  querySelector(){return null},getElementById(){return current},
  createElement(){return {dataset:{},isConnected:true,setAttribute(){},remove(){this.isConnected=false},
   querySelector(s){return s==='#account-recovery-title'?{focus(){titleFocus++;document.activeElement=this}}:null}}}};
 const context={document,GATE_ID:'public-account-auth-gate',runtimeConfig:{launch:{}},
  renderAccountRecoveryView(){return ''},accountInviteMarkup(){return ''},accountInviteContext(){return {}},
  markAccountAuthReady(){},handleAccountRecoverySubmit(){},focusAccountInput(){},focusAccountFeedback(){},
  requestAnimationFrame(fn){pending=fn}};
 vm.runInNewContext(source.slice(start,end)+';renderAccountRecoveryScreen({screen:"request",email:"synthetic@example.test"});',context);
 return {document,run:()=>pending(),titleFocus:()=>titleFocus,detach(){current.isConnected=false},replace(){current={}}};
}

test('recovery initially announces its heading when focus has not been claimed',()=>{const h=harness();h.run();assert.equal(h.titleFocus(),1)});
for(const kind of ['editing email with selected text','submit button','other active control'])test(`late recovery heading focus respects ${kind}`,()=>{
 const h=harness(),control={kind,value:'synthetic@example.test'};h.document.activeElement=control;h.run();
 assert.equal(h.document.activeElement,control);assert.equal(h.titleFocus(),0);assert.equal(control.value,'synthetic@example.test');
});
test('removed or replaced recovery gate cannot receive delayed focus',()=>{for(const change of ['detach','replace']){const h=harness();h[change]();h.run();assert.equal(h.titleFocus(),0)}});
