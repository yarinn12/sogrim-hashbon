import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source=await readFile('src/app.mjs','utf8');
const readiness=source.slice(source.indexOf('function expenseFlowReady('),source.indexOf('function expenseFlowNextLabel('));
const sync=source.slice(source.indexOf('function syncExpenseFlowActionState('),source.indexOf('function renderExpenseDateField('));
const remove=source.slice(source.indexOf('if (action === "remove-payer")'),source.indexOf('if (action === "save-expense")'));

for(const remaining of [80,120]) {
 test(`removing a payer rerenders Continue from the existing balance validation (${remaining}/120)`,()=>{
  class Button { disabled=false; }
  const next=new Button(),draft={eventId:'event',flowStep:'payer',total:'120',name:'ארוחה',
   payers:[{participantId:'p1',amount:String(remaining)},{participantId:'p2',amount:String(120-remaining)}],
   sharedByParticipantIds:['p1','p2'],inlinePayerGuestIndex:null};
  let focus='';
  const context={action:'remove-payer',target:{dataset:{index:'1'}},expenseDraft:draft,
   HTMLButtonElement:Button,normalizeExpenseFlowStep:s=>s,getEvent:()=>({participantIds:['p1','p2']}),
   hasPositiveExpenseTotal:v=>Number(v)>0,
   expensePayerSummary:()=>({balanced:draft.payers.reduce((s,p)=>s+Number(p.amount),0)===120}),
   app:{querySelector:s=>s==='[data-action="expense-step-next"]'?next:{scrollTop:17}},
   // Edited values remain fixed. Readiness must reflect them after a render.
   rebalanceExpenseDraftPayers:()=>{},render:()=>{next.disabled=false;},syncExpenseSaveState:()=>{},
   reactivateDialogAfterRender:(_dialog,selector,scroll)=>{focus=selector;assert.equal(scroll,17);}};
  runInNewContext(readiness+'\n'+sync+'\n'+remove,context);
  assert.deepEqual(draft.payers,[{participantId:'p1',amount:String(remaining)}]);
  assert.equal(next.disabled,remaining!==120,'rerender must retain the existing readiness result');
  assert.equal(focus,'[data-action="expense-payer-id"][data-index="0"]');
 });
}
