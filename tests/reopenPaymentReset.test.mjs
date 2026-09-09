import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {reopenEvent, updateTransferStatus} from '../src/domain/appActions.mjs';
import {buildSharedEventState, saveSharedEventState, mergeSharedEventIntoState} from '../src/data/sharedEventStore.mjs';

const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function reopenCurrentEvent('),source.indexOf('\nfunction prepareEventTransfers('));
const owner='account-reset-owner', peer='account-reset-peer', eventId='reset-event';
const credentials={id:'reset-shared-space',key:'synthetic_reset_shared_key_1234567890'};
let sequence=0;
function harness({legacy=false, split=false, queued=false, conflict=false, allowed=true}={}) {
  const at='2026-01-01T00:00:00.000Z';
  let initial={currentParticipantId:owner,groups:[],participants:[{id:owner,displayName:'Owner'},{id:peer,displayName:'Peer'}],events:[{
    id:eventId,name:'Reset trip',participantIds:[owner,peer],adminIds:[owner],createdByParticipantId:owner,
    sharedSpaceId:credentials.id,sharedSpaceKey:credentials.key,locked:true,closedAt:at,statusUpdatedAt:at,
    expenses:[{id:'expense',title:'Dinner',total:12000,payers:[{participantId:owner,amount:12000}],sharedByParticipantIds:[owner,peer],createdByParticipantId:owner}],
    transfers:[{id:'legacy-payment',fromParticipantId:peer,toParticipantId:owner,amount:6000,status:'pending'}],notes:[],activityLog:[]}]};
  if(split)initial.events[0].transfers=[0,1].map(i=>({...initial.events[0].transfers[0],id:`installment-${i}`,amount:3000}));
  for(const transfer of initial.events[0].transfers)initial=updateTransferStatus(initial,eventId,transfer.id,{status:'paid',participantId:peer,markedAt:at});
  if(legacy)delete initial.events[0].transferStatusUpdates;
  let canonical=buildSharedEventState(initial,eventId), version=at, conflictRemaining=conflict;
  const writes=[], receipts=[], queue=[];
  const config={storage:{mode:'supabase',url:`https://reset-${++sequence}.invalid`,table:'app_snapshots',anonKey:'synthetic',account:{userId:'reset-owner',accessToken:'synthetic'}}};
  const transport=async(url,options={})=>{
    if(url.includes('/rpc/update_shared_event_snapshot')) {
      const body=JSON.parse(options.body);writes.push(structuredClone(body));
      if(conflictRemaining){conflictRemaining=false;version=new Date(Date.parse(version)+1).toISOString();return Response.json({status:'conflict'});}
      assert.equal(body.p_expected_updated_at,version);
      canonical=structuredClone(body.p_state);version=new Date(Date.parse(version)+1).toISOString();
      const receipt={status:'updated',updatedAt:version};receipts.push(receipt);return Response.json(receipt);
    }
    assert.equal(options.method??'GET','GET');
    return Response.json([{state:canonical,updated_at:version}]);
  };
  const save=state=>saveSharedEventState(config,state,eventId,transport);
  const ctx=vm.createContext({state:structuredClone(initial),notice:'',settlementCloseConfirmation:null,
    getEvent:id=>ctx.state.events.find(e=>e.id===id),canCurrentParticipantManage:()=>allowed,
    cloneNavigationValue:structuredClone,reopenEvent,updateTransferStatus,render(){},recordEventActivity(){},
    stateSaveCheckpoint:request=>({request}),rejectedStateSaveIsCurrent:()=>true,
    persistState:async options=>{
      assert.deepEqual(Array.from(options.forceSharedEventIds),[eventId]);
      if(queued){queue.push(structuredClone(ctx.state));return{ok:false,pending:true};}
      ctx.state=await save(ctx.state);return{ok:true};
    }
  });
  vm.runInContext(handler,ctx);
  return{ctx,initial,writes,receipts,queue,save,run:resetPayments=>ctx.reopenCurrentEvent(eventId,{resetPayments}),
    get canonical(){return canonical;},refresh:local=>mergeSharedEventIntoState(local,canonical,credentials)};
}
function assertReset(state) {
  const event=state.events[0];
  assert.equal(event.locked,false);
  assert.equal(event.transfers.filter(t=>t.status==='paid').length,0,'reset payments must not resurrect');
  assert.equal(event.transfers.reduce((sum,t)=>sum+t.amount,0),6000,'the full outstanding balance must remain');
}

for(const legacy of [false,true])for(const split of [false,true])test(`reopen reset survives the actual write receipt and repeated stale peer saves (legacy=${legacy}, split=${split})`,async()=>{
  const h=harness({legacy,split});assert.equal((await h.run(true)).ok,true);
  assertReset(h.ctx.state);assertReset(h.canonical);
  for(let retry=0;retry<3;retry++) {
    const peerState=h.refresh(structuredClone(h.initial));
    h.ctx.state=await h.save(peerState);assertReset(h.ctx.state);assertReset(peerState);
  }
  assert.equal(h.receipts.length,4);
  for(const write of h.writes)assertReset(write.p_state);
});

test('offline reset persists through replay, a version conflict and another stale client',async()=>{
  const h=harness({queued:true,conflict:true,split:true});assert.equal((await h.run(true)).pending,true);
  assert.equal(h.queue.length,1);assert.equal(h.writes.length,0);
  h.ctx.state=await h.save(JSON.parse(JSON.stringify(h.queue[0])));assertReset(h.ctx.state);
  assertReset(await h.save(h.refresh(h.initial)));
  assert.equal(h.receipts.length,2);assert.equal(h.writes.length,3);
  for(const write of h.writes)assertReset(write.p_state);
});

test('reopen keep preserves the confirmed payment through a later stale save',async()=>{
  const h=harness();await h.run(false);h.ctx.state=await h.save(h.refresh(h.initial));
  assert.equal(h.ctx.state.events[0].transfers[0].status,'paid');
  assert.equal(h.canonical.events[0].transfers[0].amount,6000);assert.equal(h.receipts.length,2);
});

test('a participant without management permission cannot reset or write payments',async()=>{
  const h=harness({allowed:false});assert.equal((await h.run(true)).reason,'forbidden');
  assert.deepEqual(h.ctx.state,h.initial);assert.equal(h.writes.length,0);
});

test('an old reset replay preserves a payment confirmed afterwards',async()=>{
  const h=harness({split:true});await h.run(true);
  const reset=structuredClone(h.ctx.state), transfer=reset.events[0].transfers[0];
  const at=new Date(Date.parse(reset.events[0].statusUpdatedAt)+1).toISOString();
  const paid=updateTransferStatus(reset,eventId,transfer.id,{status:'paid',participantId:peer,markedAt:at});
  await h.save(paid);const saved=await h.save(reset);
  assert.equal(saved.events[0].transfers.filter(t=>t.status==='paid').length,1);
  assert.equal(saved.events[0].transfers[0].amount,6000);
  assert.equal(h.receipts.length,3);
});
