import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import * as draftRules from "../src/domain/expenseDraft.mjs";

const source = await readFile("src/app.mjs", "utf8");
function sourceFunction(name) {
  const start = source.indexOf("function " + name + "(");
  if (start < 0) return "";
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function cancelNotes(overrides = {}) {
  const start = source.indexOf('  if (action === "cancel-expense") {');
  const end = source.indexOf('\n  if (action === "toggle-expense-participants")', start);
  const draft = {id:"expense",eventId:"event",notesOnly:true,notes:"שינוי",
    attachmentImage:"",notesExitBaseline:{notes:"מקור",attachmentImage:""},...overrides};
  const context = {
    ...draftRules, expenseDraft:draft, action:"cancel-expense", target:{},
    state:{currentParticipantId:"owner"}, expenseSaveRequest:null,
    document:{activeElement:{}}, importantActionDialog:null, closed:0,
    clearRememberedExpenseDraft(){}, rememberExpenseDraft(){},
    expenseDialogRewindSteps:()=>1, closeDialogWithHistory(){context.closed++;},
    openImportantActionDialog(config){context.importantActionDialog=config;}
  };
  runInNewContext(sourceFunction("requestExpenseNotesExit") +
    "\n(function() {" + source.slice(start,end) + "\n})();",context);
  return context;
}
test("Back from changed expense notes asks before discarding the actual draft",()=>{
  const result=cancelNotes();
  assert.ok(result.expenseDraft,"the edited draft must remain open");
  assert.equal(result.closed,0);
  assert.equal(result.importantActionDialog?.kind,"discard-expense-notes");
  assert.equal(result.importantActionDialog?.cancelLabel,"המשך לערוך");
});
test("unchanged expense notes close without a warning",()=>{
  const result=cancelNotes({notes:"מקור"});
  assert.equal(result.expenseDraft,null);assert.equal(result.closed,1);
  assert.equal(result.importantActionDialog,null);
});
test("notes dirty detection only considers actual note and image changes",()=>{
  const base={notesOnly:true,notes:"מקור",attachmentImage:"image",notesExitBaseline:{notes:"מקור",attachmentImage:"image"}};
  const dirty=draftRules.expenseNotesHaveChanges;
  assert.equal(dirty(base),false);
  for(const changed of [{notes:"אחר"},{notes:"מקור "},{attachmentImage:""},{attachmentImage:"other"}])
    assert.equal(dirty({...base,...changed}),true);
  assert.equal(dirty({...base,error:"אירעה תקלה",total:"999",name:"שם אחר"}),false);
  assert.equal(dirty({...base,notesOnly:false,notes:"שינוי"}),false);
  assert.equal(dirty(null),false);
  assert.equal(dirty({notesOnly:true,notes:"",notesExitBaseline:{}}),false);
});
test("exit confirmation belongs to its current account and expense",()=>{
  const fn=sourceFunction("confirmExpenseNotesExit");
  assert.ok(fn);
  const run=(owner,id)=>{
    const draft={id:"expense",eventId:"event",notesOnly:true};
    const dialog={kind:"discard-expense-notes",payload:{participantId:owner,eventId:"event",expenseId:id,exitAction:"cancel-expense"}};
    const c={expenseDraft:draft,importantActionDialog:dialog,state:{currentParticipantId:"owner"},
      importantActionReturnFocus:{},closed:0,cleared:0,clearDialogBackgroundInert(){},
      closeImportantActionDialog(){c.closed++;},expenseDialogRewindSteps:()=>2,
      clearRememberedExpenseDraft(){c.cleared++;},closeDialogWithHistory(){c.closed++;},
      app:{querySelector:()=>null}};
    runInNewContext(fn+'\nconfirmExpenseNotesExit(importantActionDialog);',c);return c;
  };
  for(const [owner,id]of [["another","expense"],["owner","another"]]){
    const c=run(owner,id);assert.ok(c.expenseDraft);assert.equal(c.cleared,0);
  }
  const current=run("owner","expense");assert.equal(current.expenseDraft,null);
  assert.equal(current.cleared,1);assert.equal(current.closed,1);
});

test("an in-flight save blocks notes exit without abandoning its acknowledgement",()=>{
  const result=cancelNotes();
  const context={expenseDraft:result.expenseDraft,expenseSaveRequest:{draft:result.expenseDraft},
    expenseNotesHaveChanges:draftRules.expenseNotesHaveChanges,opened:false,
    document:{activeElement:{}},openImportantActionDialog(){context.opened=true;}};
  assert.equal(runInNewContext(sourceFunction("requestExpenseNotesExit")+
    '\nrequestExpenseNotesExit("cancel-expense");',context),true);
  assert.equal(context.opened,false);assert.ok(context.expenseDraft);
});
