import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPointerRenderRecovery} from '../src/ui/pointerRenderRecovery.mjs';

const source=await readFile(process.env.SOGRIM_PIN_PRESS_TEST_APP_SOURCE || new URL('../src/app.mjs',import.meta.url),'utf8');
function harness(){
 let accountCurrent=true,buttons=[],hit;const calls=[],callbacks=new Map(),pins=new Set();
 const state={currentParticipantId:'owner',events:[{id:'event-a',participantIds:['owner']},{id:'event-b',participantIds:['owner']}]};
 const button=()=>({dataset:{action:'toggle-personal-event-pin',eventId:'event-a'},isConnected:true,disabled:false,inert:false,menuArea:true,
  getAttribute(name){return name==='aria-disabled'&&this.ariaDisabled?'true':null;},
  closest(selector){if(selector==='[inert]')return this.inertAncestor?{}:null;
   if(selector==='button[data-action]')return this;return this.menuArea?{}:null;},
  contains(node){return node===this;},
  click(){calls.push({eventId:this.dataset.eventId});pins.add(this.dataset.eventId);}});
 let current=button();buttons=[current];hit=current;
 const listen=(type,fn)=>{const rows=callbacks.get(type)||[];rows.push(fn);callbacks.set(type,rows);};
 const context=vm.createContext({state,screen:{name:'home'},eventStatusMenu:{eventId:'event-a'},eventDialog:null,
  expenseDraft:null,importantActionDialog:null,settlementCelebration:null,
  app:{contains:node=>node.isConnected,querySelectorAll:()=>buttons},
  document:{addEventListener:listen,elementFromPoint:()=>hit},
  window:{innerWidth:834,innerHeight:1194,addEventListener:listen},
  captureFriendAccountContext:()=>({isCurrent:()=>accountCurrent}),
  visibleEventsForParticipant:(s,id)=>s.events.filter(event=>event.participantIds.includes(id)),
  pinnedEventIdsForState:()=>new Set(pins),createPointerRenderRecovery});
 const names=['personalPinPressScope','currentPersonalPinPressTarget','resolvePersonalPinPressTarget',
  'handlePersonalPinPointerDown','consumePersonalPinCompatibilityClick','installPersonalPinPressRecovery'];
 for(const name of names){const body=source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))?.[0];if(body)vm.runInContext(body,context);}
 const start=source.indexOf('const personalPinPressRecovery =');
 if(start>=0)vm.runInContext(source.slice(start,source.indexOf('const paymentPressRecovery =',start)),context);
 vm.runInContext('if(typeof installPersonalPinPressRecovery === "function") installPersonalPinPressRecovery()',context);
 const dispatch=(type,fields={})=>{const event={isPrimary:true,button:0,buttons:1,pointerType:'mouse',pointerId:7,
  clientX:50,clientY:70,target:current,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...fields};
  for(const fn of callbacks.get(type)||[]){fn(event);if(event.stopped)break;}return event;};
 return {context,state,calls,pins,dispatch,button:()=>current,
  replace(){current.isConnected=false;current=button();buttons=[current];hit=current;},
  switchAccount(){accountCurrent=false;},cover(){hit={};},duplicate(){buttons.push(button());}};
}

test('a pin press survives an incoming snapshot DOM replacement exactly once',()=>{
 const h=harness();h.dispatch('pointerdown');h.replace();h.dispatch('pointerup');
 assert.deepEqual(h.calls,[{eventId:'event-a'}]);
 assert.equal(h.dispatch('click',{detail:1}).stopped,true,'consume the native compatibility click after recovery');
 h.dispatch('pointerup');assert.equal(h.calls.length,1);
 assert.notEqual(h.dispatch('click',{detail:0}).stopped,true,'keyboard and assistive activation remain available');
});
test('an incoming pin for another event does not discard the selected pin press',()=>{
 const h=harness();h.dispatch('pointerdown');h.replace();h.pins.add('event-b');h.dispatch('pointerup');
 assert.deepEqual(h.calls,[{eventId:'event-a'}]);assert(h.pins.has('event-b'));
});
test('a connected pin press retains the native click route without replay',()=>{
 const h=harness();h.dispatch('pointerdown');h.dispatch('pointerup');assert.deepEqual(h.calls,[]);
 assert.notEqual(h.dispatch('click',{detail:1}).stopped,true);
});
for(const reason of ['account','participant','route','menu','closed menu','removed event','membership','selected pin changed',
 'disabled','inert','aria disabled','inert ancestor','different action','different event','outside menu','duplicate','covered',
 'viewport','move','release move','cancel','blur','pagehide','wheel','contextmenu'])test('a replaced pin button rejects a stale or cancelled press: '+reason,()=>{
 const h=harness();h.dispatch('pointerdown');h.replace();
 if(reason==='account')h.switchAccount();
 if(reason==='participant')h.state.currentParticipantId='other';
 if(reason==='route')h.context.screen={name:'home'};
 if(reason==='menu')h.context.eventStatusMenu={eventId:'event-a'};
 if(reason==='closed menu')h.context.eventStatusMenu=null;
 if(reason==='removed event')h.state.events=[];
 if(reason==='membership')h.state.events[0].participantIds=[];
 if(reason==='selected pin changed')h.pins.add('event-a');
 if(reason==='disabled')h.button().disabled=true;
 if(reason==='inert')h.button().inert=true;
 if(reason==='aria disabled')h.button().ariaDisabled=true;
 if(reason==='inert ancestor')h.button().inertAncestor=true;
 if(reason==='different action')h.button().dataset.action='delete-event';
 if(reason==='different event')h.button().dataset.eventId='event-b';
 if(reason==='outside menu')h.button().menuArea=false;
 if(reason==='duplicate')h.duplicate();
 if(reason==='covered')h.cover();
 if(reason==='viewport')h.context.window.innerHeight=500;
 if(reason==='move'){h.dispatch('pointermove',{clientX:90});h.dispatch('pointermove');}
 if(reason==='cancel')h.dispatch('pointercancel');
 if(['blur','pagehide','wheel','contextmenu'].includes(reason))h.dispatch(reason);
 h.dispatch('pointerup',reason==='release move'?{clientY:100}:{});assert.deepEqual(h.calls,[]);
});
