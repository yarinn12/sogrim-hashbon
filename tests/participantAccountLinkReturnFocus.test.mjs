import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(process.env.PARTICIPANT_FOCUS_TEST_APP||new URL('../src/app.mjs',import.meta.url),'utf8');
const section=(name,next)=>{const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction '+next+'(',a+10);assert.ok(a>=0&&b>a);return source.slice(a,b)};
function harness(){
 class HTMLElement{constructor(target='second',source='offline',event='event'){this.dataset={action:'link-offline-participant-account',eventId:event,sourceParticipantId:source,targetParticipantId:target};this.isConnected=true}}
 const opener=new HTMLElement(),first=new HTMLElement('first'),target=new HTMLElement(),otherSource=new HTMLElement('second','other-source'),otherEvent=new HTMLElement('second','offline','other-event');
 const context={HTMLElement,dialogReturnContext:()=> 'same-context',app:{querySelectorAll:()=>[otherEvent,otherSource,first,target]}};
 runInNewContext(section('createActionFocusDescriptor','restoreActionFocus')+'\n'+section('findActionReturnTarget','dialogReturnContext')+'\nthis.capture=createActionFocusDescriptor;this.find=findActionReturnTarget;',context);
 return{context,opener,first,target};
}
test('account-link focus descriptor preserves both offline source and connected target',()=>{const{context,opener}=harness(),d=context.capture(opener);assert.equal(d.sourceParticipantId,'offline');assert.equal(d.targetParticipantId,'second')});
test('cancelling a second account-link choice returns to that exact event/source/target after rerender',()=>{const{context,opener,target}=harness(),d=context.capture(opener);opener.isConnected=false;assert.equal(context.find(d),target)});
test('a missing account-link candidate never steals focus onto another account',()=>{const{context,opener,first}=harness(),d=context.capture(opener);opener.isConnected=false;context.app.querySelectorAll=()=>[first];assert.equal(context.find(d),undefined)});
test('connected focus targets retain existing precedence without a replacement lookup',()=>{const{context,opener}=harness();assert.equal(context.find(context.capture(opener)),opener)});
test('legacy focus descriptors retain their existing event-scoped fallback',()=>{const{context,first}=harness();context.app.querySelectorAll=()=>[first];assert.equal(context.find({action:'link-offline-participant-account',eventId:'event'}),first)});
