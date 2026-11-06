import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPointerRenderRecovery} from '../src/ui/pointerRenderRecovery.mjs';

const pointer = (extra = {}) => ({isPrimary:true,button:0,pointerId:3,clientX:50,clientY:70,...extra});
function pressHarness() {
  const old = {isConnected:true}, next = {clicks:0,click(){this.clicks++;}};
  let allowed = true;
  const context = {};
  const gesture = createPointerRenderRecovery({resolveTarget: scope => allowed && scope === context ? next : null});
  const down = () => gesture.start(pointer(),old,context);
  return {old,next,gesture,down,disallow(){allowed=false;}};
}

test('ordinary native clicks are not replayed or suppressed', () => {
  const h=pressHarness();h.down();
  assert.equal(h.gesture.finish(pointer()),false);
  assert.equal(h.next.clicks,0);
  assert.equal(h.gesture.consumeCompatibilityClick({detail:1,button:0}),false);
});
test('a removed button is recovered once through its existing click route', () => {
  const h=pressHarness();h.down();h.old.isConnected=false;
  assert.equal(h.gesture.finish(pointer()),true);
  assert.equal(h.next.clicks,1);
  assert.equal(h.gesture.finish(pointer()),false);
  assert.equal(h.next.clicks,1);
  assert.equal(h.gesture.consumeCompatibilityClick({detail:1,button:0}),true);
  assert.equal(h.gesture.consumeCompatibilityClick({detail:0,button:0}),false);
  assert.equal(h.gesture.consumeCompatibilityClick({detail:0,pointerType:'touch',button:0}),false);
  h.gesture.start(pointer(),null,null);
  assert.equal(h.gesture.consumeCompatibilityClick({detail:1,button:0}),false);
});
for(const reason of ['movement','release movement','multitouch','cancel','unavailable target']) {
  test('removed payment recovery rejects '+reason, () => {
    const h=pressHarness();h.down();h.old.isConnected=false;
    if(reason==='movement') {h.gesture.move(pointer({clientX:80}));h.gesture.move(pointer());}
    if(reason==='multitouch')h.gesture.start(pointer({isPrimary:false,pointerId:4}),null,null);
    if(reason==='cancel')h.gesture.cancel(pointer());
    if(reason==='unavailable target')h.disallow();
    assert.equal(h.gesture.finish(pointer(reason==='release movement'?{clientY:100}:{})),false);
    assert.equal(h.next.clicks,0);
    assert.equal(h.gesture.consumeCompatibilityClick({detail:1,button:0}),true);
  });
}
test('another pointer cannot release or cancel the original press', () => {
  const h=pressHarness();h.down();h.old.isConnected=false;
  h.gesture.cancel(pointer({pointerId:4}));
  assert.equal(h.gesture.finish(pointer({pointerId:4})),false);
  assert.equal(h.gesture.finish(pointer()),true);
  assert.equal(h.next.clicks,1);
});
test('secondary and contextless presses do not recover an action', () => {
  for(const fields of [{button:2},{isPrimary:false}]) {
    const h=pressHarness();h.gesture.start(pointer(fields),h.old,{});h.old.isConnected=false;
    assert.equal(h.gesture.finish(pointer()),false);assert.equal(h.next.clicks,0);
  }
  const h=pressHarness();h.gesture.start(pointer(),h.old,null);h.old.isConnected=false;
  assert.equal(h.gesture.finish(pointer()),false);
});

function anchorHarness() {
  let allowed=true,clamped=false;
  const offsets=[],context={};
  const button=(top=50)=>({isConnected:true,top,left:20,width:90,height:44,clicks:0,
    getBoundingClientRect(){return{left:this.left,top:this.top,right:this.left+this.width,bottom:this.top+this.height,width:this.width,height:this.height};},
    click(){this.clicks++;}});
  let current=button();
  const gesture=createPointerRenderRecovery({resolveTarget:()=>allowed?current:null,
    resolveRenderTarget:scope=>allowed&&scope===context?current:null,
    preservePosition:offset=>{offsets.push(offset);if(!clamped)current.top-=offset;}});
  gesture.start(pointer(),current,context);
  return{gesture,offsets,button:()=>current,
    replace(top=200){current.isConnected=false;current=button(top);return current;},
    revoke(){allowed=false;},clamp(){clamped=true;}};
}
test('a valid render preserves the pressed visual anchor before release, including repeated renders',()=>{
  const h=anchorHarness(),first=h.gesture.captureRenderAnchor();h.replace();
  assert.equal(h.gesture.restoreRenderAnchor(first),true);assert.deepEqual(h.offsets,[150]);assert.equal(h.button().top,50);
  const second=h.gesture.captureRenderAnchor();h.replace(130);
  assert.equal(h.gesture.restoreRenderAnchor(second),true);assert.deepEqual(h.offsets,[150,80]);
  assert.equal(h.gesture.finish(pointer()),true);assert.equal(h.button().clicks,1);
});
for(const reason of ['permission','dimensions','horizontal position','cancel','new press'])test('render anchoring rejects '+reason,()=>{
  const h=anchorHarness(),anchor=h.gesture.captureRenderAnchor();h.replace();
  if(reason==='permission')h.revoke();
  if(reason==='dimensions')h.button().width=100;
  if(reason==='horizontal position')h.button().left=40;
  if(reason==='cancel')h.gesture.cancel(pointer());
  if(reason==='new press')h.gesture.start(pointer(),h.button(),{});
  assert.equal(h.gesture.restoreRenderAnchor(anchor),false);assert.deepEqual(h.offsets,[]);
});
test('a user scroll that moves the press outside its button does not acquire an anchor',()=>{
  const h=anchorHarness();h.button().top=400;
  assert.equal(h.gesture.captureRenderAnchor(),null);
});
test('a clamped scroll cancels recovery even if the semantic target still matches',()=>{
 const h=anchorHarness(),anchor=h.gesture.captureRenderAnchor();h.replace();h.clamp();
 assert.equal(h.gesture.restoreRenderAnchor(anchor),false);
 assert.equal(h.gesture.finish(pointer()),false);assert.equal(h.button().clicks,0);
});

const source=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const actualFunction=name=>{
  const text=source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))?.[0];
  assert.ok(text,'actual application function '+name);return text;
};
function applicationHarness(action='mark-paid') {
  let permitted=true, accountCurrent=true;
  const transfer={id:'transfer-a',status:action==='mark-paid'?'pending':'paid',amount:8000,
    fromParticipantId:'owner',toParticipantId:'peer',statusUpdatedAt:'2026-11-01T10:00:00Z'};
  const event={id:'event-a',locked:true,currency:'ILS',participantIds:['owner','peer'],
    adminIds:['owner'],createdByParticipantId:'owner',adminsCanEditOnly:false,transfers:[transfer]};
  const makeButton=()=>({dataset:{action,transferId:transfer.id,...(action==='mark-pending-group'?{transferIds:transfer.id}:{})},
    isConnected:true,disabled:false,inert:false,row:true,getAttribute(){return null;},
    closest(selector){return selector==='[inert]'?null:this.row?{}:null;},contains(node){return this===node;}});
  let current=makeButton(),hit=current,buttons=[current];
  const context=vm.createContext({screen:{name:'settlement',eventId:event.id},eventDialog:null,
    expenseDraft:null,eventStatusMenu:null,importantActionDialog:null,settlementCelebration:null,settlementCloseConfirmation:null,
    app:{contains:node=>node.isConnected,querySelectorAll:()=>buttons},getEvent:id=>id===event.id?event:null,
    captureFriendAccountContext:()=>({isCurrent:()=>accountCurrent}),canCurrentParticipantUpdateTransfer:()=>permitted,
    window:{innerWidth:393,innerHeight:852},document:{elementFromPoint:()=>hit}});
  vm.runInContext(['paymentPressScope','currentPaymentPressTarget','resolvePaymentPressTarget'].map(actualFunction).join('\n'),context);
  const scope=context.paymentPressScope(current);
  return {event,transfer,context,scope,
    resolve:()=>context.resolvePaymentPressTarget(scope,pointer()),
    replace(){current.isConnected=false;current=makeButton();hit=current;buttons=[current];return current;},
    revoke(){permitted=false;},switchAccount(){accountCurrent=false;},
    wrongHit(){hit={};},duplicate(){buttons.push(makeButton());},button:()=>current};
}

for(const action of ['mark-paid','mark-pending','mark-pending-group']) {
  test('actual application resolves only the unchanged '+action+' row action',()=>{
    const h=applicationHarness(action);const next=h.replace();assert.equal(h.resolve(),next);
  });
}
for(const reason of ['account','route','permission','dialog','wrong hit','duplicate target','disabled','inert','different action','different transfer']) {
  test('actual application cancels stale payment recovery: '+reason,()=>{
    const h=applicationHarness();h.replace();
    if(reason==='account')h.switchAccount();
    if(reason==='route')h.context.screen={name:'settlement',eventId:h.event.id};
    if(reason==='permission')h.revoke();
    if(reason==='dialog')h.context.eventDialog={kind:'share'};
    if(reason==='wrong hit')h.wrongHit();
    if(reason==='duplicate target')h.duplicate();
    if(reason==='disabled')h.button().disabled=true;
    if(reason==='inert')h.button().inert=true;
    if(reason==='different action')h.button().dataset.action='mark-pending';
    if(reason==='different transfer')h.button().dataset.transferId='transfer-b';
    assert.equal(h.resolve(),null);
  });
}
for(const field of ['status','amount','fromParticipantId','toParticipantId','statusUpdatedAt','markedPaidAt','markedPaidByParticipantId']) {
  test('actual application rejects a newer payment revision in '+field,()=>{
    const h=applicationHarness();h.replace();h.transfer[field]=field==='amount'?9000:'changed';
    assert.equal(h.resolve(),null);
  });
}
for(const field of ['currency','locked','adminIds','participantIds','createdByParticipantId','adminsCanEditOnly']) {
  test('actual application rejects changed event context in '+field,()=>{
    const h=applicationHarness();h.replace();h.event[field]=Array.isArray(h.event[field])?['different']:typeof h.event[field]==='boolean'?!h.event[field]:'changed';
    assert.equal(h.resolve(),null);
  });
}
for(const field of ['innerWidth','innerHeight'])test('viewport changes cancel payment recovery in '+field,()=>{
 const h=applicationHarness();h.replace();h.context.window[field]-=100;
 assert.equal(h.resolve(),null);
});
