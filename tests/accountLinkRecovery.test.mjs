import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { canLinkParticipantAccountInEvent, linkParticipantAccountInEvent } from "../src/domain/appActions.mjs";
import { buildSharedEventState, eventShareCredentials, mergeSharedEventIntoState, readSharedEventState, saveSharedEventState } from "../src/data/sharedEventStore.mjs";
import * as queue from "../src/data/pendingAccountLinks.mjs";
import { isRetryablePendingSyncFailure } from "../src/data/localStore.mjs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const recovery = app.slice(app.indexOf("async function confirmPendingAccountLink("), app.indexOf("async function publishEventInvitation("));
const owner = "00000000-0000-4000-8000-000000000081";
const actor = `account-${owner}`, target = "account-00000000-0000-4000-8000-000000000082", guest = "guest-recovery-person";
const eventId = "account-link-recovery-event";
const receipt = {ownerUserId:owner,eventId,sourceParticipantId:guest,targetParticipantId:target,linkedAt:"2026-08-01T00:00:00.000Z"};
let harnessNumber=0;

function harness({ alreadyCommitted=false, loseWriteReceipt=false, switchAfterRead=false, restartSessionAfterRead=false }={}) {
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const initial={currentParticipantId:actor,groups:[],deletedParticipants:[],participants:[
    {id:actor,displayName:"Owner",kind:"user",accountLinked:true},
    {id:target,displayName:"Account member",kind:"user",accountLinked:true},
    {id:guest,displayName:"Offline member",kind:"guest"}
  ],events:[{id:eventId,name:"Recovery trip",participantIds:[actor,guest,target],adminIds:[actor],createdByParticipantId:actor,
    sharedSpaceId:"account-link-recovery-space",sharedSpaceKey:"account_link_recovery_test_key_0001",
    expenses:[{id:"original-expense",title:"Expense",total:6000,payers:[{participantId:guest,amount:6000}],sharedByParticipantIds:[actor,guest],createdByParticipantId:actor}],
    transfers:[{id:"opaque-transfer-id",fromParticipantId:actor,toParticipantId:guest,amount:3000,status:"pending"}],notes:[],activityLog:[]},
    {id:"other-event",name:"Other event",participantIds:[actor,guest],adminIds:[actor],expenses:[],transfers:[],notes:[],localIntent:"retain"}]};
  let canonical=buildSharedEventState(alreadyCommitted?linkParticipantAccountInEvent(initial,eventId,guest,target):initial,eventId);
  let version="2026-08-01T01:00:00.000Z", activeOwner=owner, loseReceipt=loseWriteReceipt, generation=0;
  const writes=[], failures=[], deferred=[], durable=[];
  const config={storage:{mode:"supabase",url:`https://link-recovery-${++harnessNumber}.invalid`,table:"app_snapshots",anonKey:"synthetic",account:{userId:owner,accessToken:"synthetic"}}};
  const transport=async (url,options={})=>{
    if(url.includes("/rpc/update_shared_event_snapshot")) {
      const body=JSON.parse(options.body);writes.push(structuredClone(body));
      assert.equal(body.p_expected_updated_at,version);
      canonical=structuredClone(body.p_state);version=new Date(Date.parse(version)+1).toISOString();
      if(loseReceipt){loseReceipt=false;return new Response(JSON.stringify({message:"Lost response"}),{status:503});}
      return new Response(JSON.stringify({status:"updated",updatedAt:version}));
    }
    assert.equal(options.method??"GET","GET");
    if(switchAfterRead)activeOwner="another-account";
    if(restartSessionAfterRead)generation++;
    return new Response(JSON.stringify([{state:canonical,updated_at:version}]));
  };
  queue.rememberPendingAccountLink(receipt,storage);
  const ctx=vm.createContext({state:structuredClone(initial),runtimeConfig:config,navigator:{onLine:true},window:{localStorage:storage},
    pendingAccountLinkRetryRequest:null,appBootHydrated:true,console,
    versionedReadCacheSessionGeneration:()=>generation,
    pendingEventMembershipOwnerId:()=>activeOwner,pendingMutationOwnerIsActive:id=>id===activeOwner,
    getEvent:id=>ctx.state.events.find(e=>e.id===id),eventShareCredentials,loadRuntimeConfig:async()=>config,
    readSharedEventState:(c,credentials,id)=>readSharedEventState(c,credentials,id,transport),mergeSharedEventIntoState,
    saveState:state=>durable.push(structuredClone(state)),flushPendingSharedState:async()=>{},
    ...queue,
    loadPendingAccountLinks:(_storage,id)=>queue.loadPendingAccountLinks(storage,id),
    markPendingAccountLinkAttempt:entry=>queue.markPendingAccountLinkAttempt(entry,storage),
    forgetPendingAccountLink:entry=>queue.forgetPendingAccountLink(entry,storage),
    canLinkParticipantAccountInEvent,linkParticipantAccountInEvent,isRetryablePendingSyncFailure,
    saveSharedState:async (state,options)=>{
      assert.deepEqual(Array.from(options.forceSharedEventIds),[eventId]);
      try {ctx.state=await saveSharedEventState(config,state,eventId,transport);return {ok:true};}
      catch(error){return {ok:false,error};}
    },emitOperationFailure:(_kind,details)=>failures.push(details),emitOperationDeferred:(_kind,details)=>deferred.push(details)
  });
  vm.runInContext(recovery,ctx);
  return {ctx,initial,writes,failures,deferred,durable,storage,get canonical(){return canonical;},pending:()=>queue.loadPendingAccountLinks(storage,owner),run:()=>ctx.retryPendingAccountLinks()};
}

test("an interrupted account link replay confirms the actual new write receipt",async()=>{
  const h=harness();await h.run();
  assert.equal(h.writes.length,1,JSON.stringify([...h.failures,...h.deferred].map(item=>({message:item.error?.message,code:item.error?.code}))));
  assert.notEqual(h.writes[0].p_state.events[0].participantAccountLinks[0].linkedAt,receipt.linkedAt);
  assert.equal(h.canonical.events[0].expenses[0].payers[0].participantId,target);
  assert.equal(h.canonical.events[0].expenses[0].total,6000);
  assert.deepEqual(h.canonical.events[0].transfers.map(t=>[t.id,t.amount,t.status,t.toParticipantId]),[["opaque-transfer-id",3000,"pending",target]]);
  assert.deepEqual(h.ctx.state.events.find(e=>e.id==="other-event"),h.initial.events[1]);
  assert.deepEqual(h.pending(),[],"the verified replay must acknowledge the original durable intent");
  assert.deepEqual(h.failures,[]);assert.deepEqual(h.deferred,[]);
  await h.run();assert.equal(h.writes.length,1,"restart/retry must not duplicate the link");
});

test("an old link response cannot cross sign-out and sign-in to the same account",async()=>{
  const h=harness({alreadyCommitted:true,restartSessionAfterRead:true});await h.run();
  assert.equal(h.writes.length,0);assert.equal(h.durable.length,0);assert.equal(h.pending().length,1);
  assert.deepEqual(h.ctx.state,h.initial);
});

test("a peer's committed identical link satisfies the pending intent without another write",async()=>{
  const h=harness({alreadyCommitted:true});await h.run();
  assert.equal(h.writes.length,0,"canonical confirmation must precede any replay");
  assert.deepEqual(h.pending(),[]);assert.deepEqual(h.failures,[]);
  assert.equal(h.ctx.state.events[0].participantIds.includes(guest),false);
  assert.equal(h.durable.length,1);
});

test("a committed replay with a lost response is acknowledged on retry exactly once",async()=>{
  const h=harness({loseWriteReceipt:true});await h.run();
  assert.equal(h.writes.length,1);assert.equal(h.pending().length,1);
  await h.run();
  assert.equal(h.writes.length,1);assert.deepEqual(h.pending(),[]);assert.deepEqual(h.failures,[]);
});

test("a late canonical link read cannot mutate the next signed-in account",async()=>{
  const h=harness({alreadyCommitted:true,switchAfterRead:true});await h.run();
  assert.equal(h.writes.length,0);assert.equal(h.durable.length,0);assert.equal(h.pending().length,1);
  assert.deepEqual(h.ctx.state,h.initial);
});
