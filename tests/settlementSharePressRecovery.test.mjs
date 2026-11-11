import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPointerRenderRecovery} from '../src/ui/pointerRenderRecovery.mjs';

// The optional path lets the coordinator run this same regression against an
// immutable OLD application checkout. The normal suite reads its own app.
const source=await readFile(process.env.SOGRIM_SHARE_PRESS_TEST_APP_SOURCE || new URL('../src/app.mjs',import.meta.url),'utf8');
const down=(extra={})=>({isPrimary:true,button:0,pointerId:3,clientX:50,clientY:70,...extra});
const actions=['share-whatsapp','copy-settlement','copy-event-report'];
function harness(action='share-whatsapp') {
 let accountCurrent=true,buttons=[],hit;
 const callbacks=new Map(),calls=[],scrolls=[];
 const event={id:'event-a',name:'אירוע בדיקה',locked:true,currency:'ILS',participantIds:['owner','peer'],
  participantAliases:{},updatedAt:'2026-11-11T17:00:00Z',expenses:[],
  transfers:[{id:'transfer-a',amount:8000,status:'paid',fromParticipantId:'owner',toParticipantId:'peer'}]};
 const button=()=>({dataset:{action,eventId:event.id},isConnected:true,disabled:false,inert:false,shareArea:true,top:50,
  getAttribute(name){return name==='aria-disabled'&&this.ariaDisabled?'true':null;},
  closest(selector){if(selector==='[inert]')return this.inertAncestor?{}:null;
   if(selector==='button[data-action]')return this;
   return this.shareArea?{}:null;},
  contains(target){return target===this;},
  getBoundingClientRect(){return{left:20,right:110,top:this.top,bottom:this.top+44,width:90,height:44};},
  click(){calls.push({action:this.dataset.action,eventId:this.dataset.eventId});}});
 let current=button();buttons=[current];hit=current;
 const document={addEventListener(type,fn){const list=callbacks.get(type)||[];list.push(fn);callbacks.set(type,list);},elementFromPoint:()=>hit};
 const context=vm.createContext({screen:{name:'settlement',eventId:event.id},eventDialog:null,expenseDraft:null,eventStatusMenu:null,
  importantActionDialog:null,settlementCelebration:null,settlementCloseConfirmation:null,
  app:{contains:node=>node.isConnected,querySelectorAll:()=>buttons},document,
  window:{innerWidth:393,innerHeight:852,addEventListener:document.addEventListener,
   scrollBy({top}){scrolls.push(top);current.top-=top;}},
  captureFriendAccountContext:()=>({isCurrent:()=>accountCurrent}),getEvent:id=>id===event.id?event:null,
  createPointerRenderRecovery,
  resolvePaymentPressTarget:()=>null,currentPaymentPressTarget:()=>null,handlePaymentPointerDown:()=>{},
  consumePaymentCompatibilityClick:()=>{},handleEventPressPointerDown:()=>{},consumeEventPressClick:()=>{}});
 const names=['settlementSharePressScope','currentSettlementSharePressTarget','resolveSettlementSharePressTarget',
  'handleSettlementSharePointerDown','consumeSettlementShareCompatibilityClick'];
 for(const name of names){const body=source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))?.[0];if(body)vm.runInContext(body,context);}
 const controllers=source.slice(source.indexOf('const paymentPressRecovery ='),source.indexOf('let resumeSyncRequest ='));
 assert.ok(controllers.includes('createPointerRenderRecovery'));
 vm.runInContext(controllers,context);
 const start=source.indexOf('document.addEventListener("pointerdown", handleEventPressPointerDown, true);');
 const end=source.indexOf('app.addEventListener("pointerdown", handleEventWorkspaceSwipeStart);',start);
 assert.ok(start>0&&end>start);
 vm.runInContext(source.slice(start,end),context);
 const dispatch=(type,fields={})=>{const e=down({...fields,target:current,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  for(const fn of callbacks.get(type)||[]){fn(e);if(e.stopped)break;}return e;};
 return {calls,event,context,scrolls,dispatch,button:()=>current,
  replace(top=50){current.isConnected=false;current=button();current.top=top;buttons=[current];hit=current;return current;},
  capture:()=>vm.runInContext('typeof settlementSharePressRecovery === "undefined" ? null : settlementSharePressRecovery.captureRenderAnchor()',context),
  restore:anchor=>{context.testAnchor=anchor;return vm.runInContext('settlementSharePressRecovery.restoreRenderAnchor(testAnchor)',context);},
  switchAccount(){accountCurrent=false;},wrongHit(){hit={};},duplicate(){buttons.push(button());}};
}

for(const action of actions)test('pointer-bound share actions survive a replaced '+action+' button exactly once',()=>{
 const h=harness(action);h.dispatch('pointerdown');h.replace();h.dispatch('pointerup');
 assert.deepEqual(h.calls,[{action,eventId:'event-a'}]);
 assert.equal(h.dispatch('click',{detail:1}).stopped,true);
 h.dispatch('pointerup');assert.equal(h.calls.length,1);
 assert.notEqual(h.dispatch('click',{detail:0}).stopped,true,'keyboard and assistive activation stay available');
});
for(const action of actions)test('an ordinary connected '+action+' press keeps the native click route',()=>{
 const h=harness(action);h.dispatch('pointerdown');h.dispatch('pointerup');
 assert.deepEqual(h.calls,[]);assert.notEqual(h.dispatch('click',{detail:1}).stopped,true);
});
for(const reason of ['account','route','dialog','celebration','confirmation','disabled','inert','aria disabled','inert ancestor',
 'different action','different event','wrong hit','duplicate','outside share area','viewport','new event revision',
 'new transfer','new expense','movement','release movement','cancel','blur','pagehide'])test('read-only sharing rejects stale or cancelled press: '+reason,()=>{
 const h=harness();h.dispatch('pointerdown');h.replace();
 if(reason==='account')h.switchAccount();
 if(reason==='route')h.context.screen={name:'settlement',eventId:h.event.id};
 if(reason==='dialog')h.context.eventDialog={kind:'share'};
 if(reason==='celebration')h.context.settlementCelebration={};
 if(reason==='confirmation')h.context.settlementCloseConfirmation={};
 if(reason==='disabled')h.button().disabled=true;
 if(reason==='inert')h.button().inert=true;
 if(reason==='aria disabled')h.button().ariaDisabled=true;
 if(reason==='inert ancestor')h.button().inertAncestor=true;
 if(reason==='different action')h.button().dataset.action='mark-paid';
 if(reason==='different event')h.button().dataset.eventId='event-b';
 if(reason==='wrong hit')h.wrongHit();
 if(reason==='duplicate')h.duplicate();
 if(reason==='outside share area')h.button().shareArea=false;
 if(reason==='viewport')h.context.window.innerHeight=400;
 if(reason==='new event revision')h.event.updatedAt='2026-11-11T17:00:01Z';
 if(reason==='new transfer')h.event.transfers[0].status='pending';
 if(reason==='new expense')h.event.expenses.push({id:'expense-new',amount:20});
 if(reason==='movement'){h.dispatch('pointermove',{clientX:80});h.dispatch('pointermove');}
 if(reason==='cancel')h.dispatch('pointercancel');
 if(reason==='blur'||reason==='pagehide')h.dispatch(reason);
 h.dispatch('pointerup',reason==='release movement'?{clientY:100}:{});assert.deepEqual(h.calls,[]);
});
test('read-only sharing preserves its pressed position through consecutive notice renders',()=>{
 const h=harness();h.dispatch('pointerdown');const first=h.capture();h.replace(150);assert.equal(h.restore(first),true);
 const second=h.capture();h.replace(120);assert.equal(h.restore(second),true);
 h.dispatch('pointerup');assert.equal(h.calls.length,1);assert.deepEqual(h.scrolls,[100,70]);
});
