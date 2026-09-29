import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as memory from "../src/domain/expenseDraftMemory.mjs";
import { linkParticipantAccountInEvent, updateExpense } from "../src/domain/appActions.mjs";
import { parseMoneyInput, sumMoneyAmounts } from "../src/domain/money.mjs";
import { validateExpense } from "../src/domain/validation.mjs";
import { buildQuickItemExpenses } from "../src/domain/quickExpenses.mjs";
import { summarizePayerDraft } from "../src/domain/expenseDraft.mjs";
import { buildSharedEventState, saveSharedEventState } from "../src/data/sharedEventStore.mjs";

const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function functionSource(name) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(app)?.index;
  assert.notEqual(start, undefined, name);
  const end = /\n(?:async )?function /.exec(app.slice(start + 1));
  return app.slice(start, end ? start + 1 + end.index : undefined);
}
const owner = "account-00000000-0000-4000-8000-000000000081";
const target = "account-00000000-0000-4000-8000-000000000082", guest = "guest-draft";
const eventId = "draft-link-event";
let serial = 0;
function harness({ quick = false, restored = false, pending = false } = {}) {
  const initial = { currentParticipantId: owner, groups: [], participants: [
    {id:owner,displayName:"Owner",accountLinked:true}, {id:target,displayName:"Connected",accountLinked:true},
    {id:guest,displayName:"Guest",kind:"guest"}
  ], events: [{id:eventId,participantIds:[owner,guest,target],adminIds:[owner],createdByParticipantId:owner,
    name:"Draft link",expenses:[],transfers:[],sharedSpaceId:"draft-link-space",sharedSpaceKey:"isolated_draft_link_key_1234567890"}] };
  const state = linkParticipantAccountInEvent(initial,eventId,guest,target);
  assert.notEqual(state,initial);
  const draft = { eventId, mode:quick?"items":"single", name:"Preserved draft",total:"12",
    payers:[{participantId:guest,amount:"5.25",amountTouched:true,autoAmount:false},{participantId:target,amount:"6.75",amountTouched:true,autoAmount:false}],
    sharedByParticipantIds:[owner,guest,target],occurredOn:"2026-09-29",quickPayerId:guest,
    quickItems:[{name:"Guest dish",amount:"12",sharedBy:guest},
      {name:"Shared dish",amount:"4",sharedBy:"__custom__",sharedByParticipantIds:[guest,target]}] };
  const values = new Map([[memory.expenseDraftMemoryKey(owner,eventId),memory.serializeExpenseDraftMemory(draft)]]);
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let canonical = buildSharedEventState(state,eventId), version="2026-09-29T00:00:00.000Z";
  const writes=[],acknowledgements=[],closures=[];
  const pendingLinks=pending?[{...state.events[0].participantAccountLinks[0],eventId}]:[];
  const config={storage:{mode:"supabase",url:`https://draft-link-${++serial}.invalid`,anonKey:"synthetic",table:"app_snapshots",
    account:{userId:owner.slice(8),accessToken:"synthetic"}}};
  const transport=async(url,options={})=>{
    if(url.includes("/rpc/update_shared_event_snapshot")) {
      const payload=JSON.parse(options.body);writes.push(payload);
      assert.equal(payload.p_expected_updated_at,version);
      canonical=structuredClone(payload.p_state);version=new Date(Date.parse(version)+1).toISOString();
      acknowledgements.push(version);
      return new Response(JSON.stringify({status:"updated",updatedAt:version}));
    }
    assert.equal(options.method??"GET","GET");
    return new Response(JSON.stringify([{state:canonical,updated_at:version}]));
  };
  const ctx=vm.createContext({...memory,state,expenseDraft:structuredClone(draft),expenseSaveInProgress:false,expenseSaveRequest:null,
    window:{localStorage:storage}, getEvent:id=>ctx.state.events.find(e=>e.id===id),
    loadPendingAccountLinks:()=>pendingLinks,pendingEventMembershipOwnerId:()=>owner.slice(8),
    activeEventParticipants:event=>ctx.state.participants.filter(p=>event.participantIds.includes(p.id)),
    canCurrentParticipantEdit:()=>true,editBlockedMessage:()=>"Blocked",render:()=>ctx.rememberExpenseDraft(),
    syncExpenseSaveState(){},reactivateDialogAfterRender(){},activateDialog(){},parseMoneyInput,sumMoneyAmounts,
    summarizePayerDraft,normalizeExpenseFlowStep:step=>step,hasPositiveExpenseTotal:value=>parseMoneyInput(value)>0,
    validateExpense,updateExpense,buildQuickItemExpenses,makeId:()=>`draft-expense-${++serial}`,todayInputValue:()=>"2026-09-29",
    cloneNavigationValue:structuredClone,recordEventActivity(){},reconcileEventTransfers(){},
    persistState:async()=>{ctx.state=await saveSharedEventState(config,ctx.state,eventId,transport);return {ok:true};},
    stateSaveCheckpoint:request=>({request}),rejectedStateSaveIsCurrent:()=>true,EXPENSE_FOREGROUND_SAVE_BUDGET_MS:350,
    publishReferralActivityAfterSave(){},publishEventActivityAfterSave(){},emitProductMetric(){},saveFailureMessage:()=>"Rejected",
    expenseDialogRewindSteps:()=>1,closeDialogWithHistory:()=>closures.push(true),formatCount:String,notice:""});
  for(const name of ["mergePayers","expenseFlowReady","expenseDraftAccountLinkOptions","rememberExpenseDraft","restoreExpenseDraft","clearRememberedExpenseDraft","saveExpense","saveQuickExpenses"])
    vm.runInContext(functionSource(name),ctx);
  if(restored)ctx.expenseDraft=ctx.restoreExpenseDraft(state.events[0]);
  return {ctx,draft,initial,pendingLinks,values,writes,acknowledgements,closures,get canonical(){return canonical;},
    save:()=>ctx[quick?"saveQuickExpenses":"saveExpense"](eventId)};
}

for(const quick of [false,true]) {
  test(`an unconfirmed link retains ${quick?'restaurant':'split-payer'} input until its receipt is confirmed`,async()=>{
    const h=harness({quick,restored:true,pending:true});
    assert.deepEqual(h.ctx.expenseDraft.payers,h.draft.payers);
    assert.equal(h.ctx.expenseDraft.quickPayerId,guest);
    h.ctx.rememberExpenseDraft();
    await h.save();
    assert.equal(h.writes.length,0,"unconfirmed redirection cannot publish different payment attribution");
    assert.equal(h.ctx.expenseDraft.payers[0].participantId,guest);
    h.pendingLinks.length=0;
    await h.save();
    assert.equal(h.writes.length,1);
    assert.equal(h.canonical.events[0].expenses[0].payers[0].participantId,target);
  });
}

test("a rejected optimistic link leaves the original payer and amounts in the durable draft",()=>{
  const h=harness({restored:true,pending:true});
  h.ctx.rememberExpenseDraft();
  h.ctx.state=h.initial;h.pendingLinks.length=0;
  h.ctx.rememberExpenseDraft();
  const restored=h.ctx.restoreExpenseDraft(h.initial.events[0]);
  assert.deepEqual(restored.payers,h.draft.payers);
  assert.deepEqual(restored.sharedByParticipantIds,h.draft.sharedByParticipantIds);
});

test("link redirection keeps unfinished amount input and interrupted-save revision evidence",()=>{
  const h=harness();
  const draft=h.ctx.expenseDraft;
  draft.payers[0].amount="5,123";
  draft.pendingExpenseSave={expense:{id:"previous-attempt",payers:[{participantId:guest,amount:500}]}};
  draft.baseExpenseUpdatedAt="2026-09-01T00:00:00.000Z";
  const evidence=structuredClone(draft.pendingExpenseSave);
  h.ctx.rememberExpenseDraft();
  assert.equal(h.ctx.expenseDraft,draft,"a background render must retain the editor request identity");
  assert.equal(draft.payers[0].participantId,target);assert.equal(draft.payers[0].amount,"5,123");
  assert.deepEqual(draft.pendingExpenseSave,evidence,"a link must not waive concurrent expense edit checks");
  assert.equal(draft.baseExpenseUpdatedAt,"2026-09-01T00:00:00.000Z");
});

test("draft redirection requires an unambiguous completed link in this event",()=>{
  for(const change of [
    event=>{event.id="another-event";},
    event=>{event.participantIds.push(guest);},
    event=>{event.inactiveParticipantIds=[target];},
    event=>{event.participantAccountLinks[0].linkedAt="invalid";},
    event=>{event.participantAccountLinks.push({...event.participantAccountLinks[0],targetParticipantId:owner});},
    event=>{event.participantAccountLinks=[];}
  ]) {
    const h=harness(),event=h.ctx.state.events[0];change(event);
    const before=structuredClone(h.ctx.expenseDraft);
    memory.remapExpenseDraftAccountLinks(h.ctx.expenseDraft,event);
    assert.deepEqual(h.ctx.expenseDraft,before);
  }
});

for(const quick of [false,true]) for(const restored of [false,true]) {
  test(`account linking preserves ${restored?"reopened":"open"} ${quick?"restaurant":"split-payer"} draft through the final write and receipt`,async()=>{
    const h=harness({quick,restored});
    h.ctx.rememberExpenseDraft();
    if(!quick)assert.equal(h.ctx.expenseFlowReady("payer"),true,"merged payer rows must allow the user to continue to review");
    await h.save();
    assert.equal(h.writes.length,1,`the linked draft must remain saveable: ${h.ctx.expenseDraft?.error}`);
    assert.equal(h.acknowledgements.length,1);
    const expenses=h.canonical.events[0].expenses;
    assert.deepEqual(expenses.map(e=>e.payers),quick
      ? [[{participantId:target,amount:1200}],[{participantId:target,amount:400}]]
      : [[{participantId:target,amount:1200}]]);
    assert.deepEqual(expenses.map(e=>e.sharedByParticipantIds),quick?[[target],[target]]:[[owner,target]]);
    assert.equal(expenses.reduce((sum,e)=>sum+e.total,0),quick?1600:1200);
    assert.equal(h.canonical.events[0].participantAccountLinks.length,1);
    assert.equal(h.closures.length,1);assert.equal(h.ctx.expenseDraft,null);assert.equal(h.values.size,0);
  });
}
