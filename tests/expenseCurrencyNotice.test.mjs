import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const source=await readFile("src/app.mjs","utf8");
const notice="המטבע הוחלף; יש להזין מחדש את הסכום ואת סכומי המשלמים.";
function harness({foreign=false,amountReady=true,payerReady=true,error=notice}={}){
 const draft={eventId:"event",total:"240",sourceCurrency:foreign?"USD":"ILS",payers:[{participantId:"owner",amount:"240"}],fxError:error};
 let removed=false;const node={remove(){removed=true;}};
 const context={expenseDraft:draft,EXPENSE_CURRENCY_REENTRY_NOTICE:notice,getEvent:()=>({id:"event",currency:"ILS"}),expenseUsesForeignCurrency:()=>foreign,expenseFlowReady:step=>step==="amount"?amountReady:payerReady,HTMLButtonElement:class {},syncExpenseSaveState(){},app:{querySelector:selector=>selector==="[data-expense-fx-notice]"?node:null}};
 const start=source.indexOf("function clearResolvedExpenseCurrencyNotice()");if(start>=0)runInNewContext(source.slice(start,source.indexOf("function syncExpenseFxPreview()",start)),context);
 const a=source.indexOf("function syncExpenseFlowActionState()"),b=source.indexOf("function renderExpenseDateField(",a);runInNewContext(source.slice(a,b),context);
 return {draft,sync:()=>context.syncExpenseFlowActionState(),removed:()=>removed};
}
test("re-entering a valid event-currency amount clears only the completed currency reminder",()=>{
 const h=harness(),before=structuredClone(h.draft);h.sync();assert.equal(h.draft.fxError,"");assert.equal(h.removed(),true);delete before.fxError;const after=structuredClone(h.draft);delete after.fxError;assert.deepEqual(after,before);
});
test("currency reminder remains while the amount or payer step is incomplete",()=>{
 for(const state of [{amountReady:false},{payerReady:false}]){const h=harness(state);h.sync();assert.equal(h.draft.fxError,notice);assert.equal(h.removed(),false);}
});
test("a source-provider failure and a foreign-currency reminder are never cleared by event-currency recovery",()=>{
 for(const state of [{error:"לא ניתן לקבל שער כעת"},{foreign:true}]){const h=harness(state),before=h.draft.fxError;h.sync();assert.equal(h.draft.fxError,before);assert.equal(h.removed(),false);}
});
