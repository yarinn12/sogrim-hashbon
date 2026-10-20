import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source=await readFile('src/app.mjs','utf8');
const action=source.slice(source.indexOf('function applyExpenseParticipantPreset('),source.indexOf('function normalizeExpenseFlowStep('));
for(const [name,selected,want] of [
 ['all selected clears all',['a','b','c'],[]],
 ['partial selection selects all',['b'],['a','b','c']],
 ['empty selection selects all',[],['a','b','c']],
 ['unknown stale IDs do not prevent clearing all known rows',['a','b','c','stale'],[]]
])test('expense bulk toggle: '+name,()=>{
 class Input { constructor(id){this.dataset={participantId:id};this.checked=selected.includes(id);} closest(){return{classList:{toggle(){}}};} focus(){} }
 const inputs=['a','b','c'].map(id=>new Input(id)),remembered=[];
 const toolbar={outerHTML:''},draft={eventId:'event',sharedByParticipantIds:[...selected],error:'old error'};
 const next={disabled:false};const dialog={querySelectorAll:()=>inputs,querySelector:s=>s==='[data-expense-participant-toolbar]'?toolbar:s==='#expense-form-error'?{remove(){}}:inputs[0]};
 const context={expenseDraft:draft,HTMLInputElement:Input,getEvent:()=>({id:'event'}),expenseParticipantsForCurrentDraft:()=>['a','b','c'].map(id=>({id})),app:dialog,
  trigger:{closest:()=>dialog},renderExpenseParticipantToolbar:()=>'<toolbar>',syncExpenseDetailsSummary(){},syncExpenseConfirmationSummary(){},
  syncExpenseFlowActionState:()=>{next.disabled=draft.sharedByParticipantIds.length===0;},rememberExpenseDraft:()=>remembered.push([...draft.sharedByParticipantIds]),replaceBrowserHistoryState(){},requestAnimationFrame:fn=>fn()};
 runInNewContext(action+'\napplyExpenseParticipantPreset("toggle",trigger);',context);
 assert.deepEqual(Array.from(draft.sharedByParticipantIds),want);
 assert.deepEqual(inputs.filter(i=>i.checked).map(i=>i.dataset.participantId),want);
 assert.deepEqual(remembered,[want]);assert.equal(next.disabled,want.length===0);assert.equal(draft.error,'');
});

test('progress navigation validates forward jumps and preserves backwards editing',()=>{
 const start=source.indexOf('function navigateExpenseProgress(');
 assert.ok(start>=0,'progress bars need a guarded navigation action');
 const code=source.slice(start,source.indexOf('function renderExpenseFlowReview(',start));
 const steps=['amount','name','payer','participants','review'];
 for(const missing of steps.slice(0,-1)){
  const draft={flowStep:'amount'},calls=[];
  const context={expenseDraft:draft,expenseFlowStepsForDraft:()=>steps,normalizeExpenseFlowStep:s=>s,expenseFlowReady:s=>s!==missing,
   expenseFlowValidationMessage:s=>'missing '+s,render:()=>calls.push('render'),activateExpenseEntryDialog:()=>calls.push('focus'),moveExpenseFlowTo:s=>calls.push(s)};
  runInNewContext(code+'\nnavigateExpenseProgress("review");',context);
  assert.equal(draft.flowStep,missing);assert.equal(draft.error,'missing '+missing);assert.deepEqual(calls,['render','focus']);
 }
 for(const [current,target,ready,want] of [['participants','name',false,'name'],['amount','review',true,'review'],['payer','payer',false,null],['amount','unknown',true,null],['participants','participants',true,'participants']]){
  const draft={flowStep:current,participantAddView:'menu'},calls=[];
  runInNewContext(code+'\nnavigateExpenseProgress(target);',{expenseDraft:draft,target,expenseFlowStepsForDraft:()=>steps,normalizeExpenseFlowStep:s=>s,expenseFlowReady:()=>ready,expenseFlowValidationMessage:()=>'',render(){},activateExpenseEntryDialog(){},moveExpenseFlowTo:s=>calls.push(s)});
  assert.deepEqual(calls,want?[want]:[]);
  assert.equal(draft.participantAddView,want?null:'menu','real step navigation exits the participant add subview');
 }
});
