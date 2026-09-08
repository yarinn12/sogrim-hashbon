import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { linkParticipantAccountInEvent } from "../src/domain/appActions.mjs";
import { createParticipantAccountLinkSnapshot, participantAccountLinkSnapshotMatches } from "../src/domain/participantAccountLink.mjs";
import { accountLinkIsConfirmed } from "../src/data/pendingAccountLinks.mjs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = appSource.indexOf(start), to = appSource.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return appSource.slice(from, to);
}
const preparation = section("async function prepareSharedEventForInvitation(", "async function rotateCurrentEventInvite(");
const mergeFlow = section("async function mergeParticipantsInStateNow(", "function dropParticipantFromDrafts(");
const owner = "account-00000000-0000-4000-8000-000000000081";
const target = "account-00000000-0000-4000-8000-000000000082";
const guest = "guest-offline-person";

// Execute the actual UI orchestration and domain action. Only the transport,
// local storage acknowledgement and DOM rendering are controlled boundaries.
function harness({ prepareError, accountResult, deliverLink = true, linkError, changeIdentity = false } = {}) {
  const unrelated = { id: "unrelated-conflict", name: "Unresolved old event", participantIds: [owner, guest],
    adminIds: [owner], expenses: [], transfers: [], pendingIntent: "keep exactly" };
  const initial = { currentParticipantId: owner, groups: [], deletedParticipants: [], participants: [
    { id: owner, kind: "user", displayName: "Owner", accountLinked: true },
    { id: guest, kind: "guest", displayName: "שם אופליין" },
    { id: target, kind: "user", displayName: "Connected Person", accountLinked: true }
  ], events: [{ id: "link-event", name: "Synthetic trip", participantIds: [owner, guest, target],
    adminIds: [owner], createdByParticipantId: owner, sharedSpaceId: "synthetic-space", sharedSpaceKey: "synthetic-key",
    expenses: [{ id: "expense-one", total: 9000, payers: [{ participantId: guest, amount: 9000 }],
      createdByParticipantId: guest, sharedByParticipantIds: [owner, guest, target] }], transfers: [] }, unrelated] };
  const canonical = structuredClone(initial);
  const config = { storage: { mode: "supabase", account: { userId: owner.slice(8) } } };
  const pending = { mergeKind: "account-link", eventId: "link-event", sourceId: guest, targetId: target,
    identitySnapshot: createParticipantAccountLinkSnapshot({event:initial.events[0],source:initial.participants[1],target:initial.participants[2]}) };
  const calls = [], receipts = new Map(), messages = [];
  const ctx = vm.createContext({
    state: structuredClone(initial), runtimeConfig: config, eventDialog: {eventId:"link-event",kind:"participant-link"},
    screen:{eventId:"link-event"},notice:"",localProfile:null,console:{info(){},warn(){}},
    getEvent:id=>ctx.state.events.find(e=>e.id===id),loadRuntimeConfig:async()=>config,
    reconcileEventInviteAccountBoundary(){},eventShareCredentials:e=>e.sharedSpaceId?{id:e.sharedSpaceId,key:e.sharedSpaceKey}:null,
    ensureEventShareCredentials(){},EVENT_SPACE_ID_FIELD:"sharedSpaceId",EVENT_SPACE_KEY_FIELD:"sharedSpaceKey",
    saveSharedEventState:async(_config,state,id)=>{
      calls.push({phase:"event-preflight",eventId:id});
      if(prepareError) throw prepareError;
      if(changeIdentity) state.participants.find(p=>p.id===target).displayName="Different identity";
      return state;
    },
    saveSharedState:async(state,options)=>{
      const event=state.events.find(e=>e.id==="link-event"),linked=event.participantAccountLinks?.length>0;
      calls.push({phase:linked?"link-save":"account-preflight",options});
      if(!linked) return accountResult??{ok:true,pending:true,partial:true,failedEventIds:[unrelated.id]};
      if(linkError) return {ok:false,error:linkError};
      if(deliverLink) canonical.events[0]=structuredClone(event);
      return {ok:true,pending:true,partial:true,failedEventIds:[unrelated.id]};
    },
    participantAccountLinkSnapshotMatches,linkParticipantAccountInEvent,
    cloneNavigationValue:structuredClone,stateSaveCheckpoint:request=>({request}),rejectedStateSaveIsCurrent:()=>true,
    pendingAccountLinkReceipt:(state)=>{const link=state.events[0].participantAccountLinks[0];return {...link,eventId:"link-event",ownerUserId:owner.slice(8)};},
    rememberPendingAccountLink:r=>receipts.set(r.eventId,r),forgetPendingAccountLink:r=>receipts.delete(r.eventId),
    confirmPendingAccountLink:async receipt=>accountLinkIsConfirmed(canonical,receipt),
    participantAccountLinkCompletionMessage:(_source,_target,{pending})=>pending?"Waiting for link confirmation":"Link confirmed",
    clearMergeParticipantsDraftFor(){},emitOperationFailure(){},emitOperationDeferred(){},schedulePendingMutationRecovery(){},
    showAsyncEventParticipantMessage:(_id,message)=>messages.push(message),dropParticipantFromDrafts(){},
    render(){},reactivateDialogAfterRender(){}
  });
  vm.runInContext(preparation+mergeFlow,ctx);
  return {ctx,initial,canonical,calls,receipts,messages,run:()=>ctx.mergeParticipantsInStateNow(pending)};
}

test("account linking proceeds when an unrelated event remains durably pending", async () => {
  const h=harness();
  const result=await h.run();
  assert.equal(result?.confirmed,true,"a pending sibling must not cancel a verified event link");
  assert.equal(h.canonical.events[0].participantIds.includes(guest),false);
  assert.equal(h.canonical.events[0].expenses[0].payers[0].participantId,target);
  assert.equal(h.canonical.events[0].expenses[0].total,9000);
  assert.deepEqual(h.ctx.state.events[1],h.initial.events[1],"unrelated pending intent must remain untouched");
  assert.deepEqual(h.calls.map(c=>c.phase),["event-preflight","link-save"]);
  assert.equal(h.receipts.size,0);
});

test("an unacknowledged link remains pending, never a false successful merge", async () => {
  const h=harness({deliverLink:false});const result=await h.run();
  assert.equal(result?.pending,true);assert.equal(result?.confirmed,false);
  assert.equal(h.receipts.size,1,"keep the link receipt for durable recovery");
  assert.equal(h.canonical.events[0].participantIds.includes(guest),true);
  assert.equal(h.ctx.eventDialog.message,"Waiting for link confirmation");
});

test("the default invitation preparation still requires account cloud acknowledgement", async () => {
  const h=harness();
  await assert.rejects(h.ctx.prepareSharedEventForInvitation("link-event",{publishExisting:true}),{code:"EVENT_INVITE_NOT_READY"});
  assert.equal(h.calls.some(c=>c.phase==="link-save"),false);
});

for(const code of ["42501","NETWORK_ERROR"]) {
  test(`an actual event preflight ${code} still prevents the link`,async()=>{
    const h=harness({prepareError:Object.assign(new Error("Event unavailable"),{code})});
    assert.equal((await h.run()).ok,false);
    assert.deepEqual(h.ctx.state,h.initial);
    assert.equal(h.calls.some(c=>c.phase==="link-save"),false);
  });
}

test("failure to durably save the actual link locally still prevents confirmation",async()=>{
  const h=harness({linkError:Object.assign(new Error("Storage full"),{code:"LOCAL_STORAGE_UNAVAILABLE"})});
  assert.equal((await h.run()).ok,false);assert.deepEqual(h.ctx.state,h.initial);
  assert.equal(h.receipts.size,0);
});

test("a permanently rejected unrelated outbox is not flushed before creating the link",async()=>{
  const h=harness({accountResult:{ok:false,error:Object.assign(new Error("Unrelated locked event"),{code:"42501"})}});
  assert.equal((await h.run()).confirmed,true);
  assert.equal(h.calls.some(c=>c.phase==="account-preflight"),false);
  assert.deepEqual(h.ctx.state.events[1],h.initial.events[1]);
});

test("changed participant identity during event preflight still cancels the link",async()=>{
  const h=harness({changeIdentity:true});const result=await h.run();
  assert.equal(result.identityChanged,true);
  assert.equal(h.calls.some(c=>c.phase==="link-save"),false);
  assert.equal(h.canonical.events[0].participantIds.includes(guest),true);
});

test("a hard rejection of the actual link restores the previous state and receipt",async()=>{
  const h=harness({linkError:Object.assign(new Error("Permission denied"),{code:"42501"})});
  assert.equal((await h.run()).ok,false);
  assert.deepEqual(h.ctx.state,h.initial);assert.equal(h.receipts.size,0);
  assert.equal(h.calls.some(c=>c.phase==="link-save"),true);
});
