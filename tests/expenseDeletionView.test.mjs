import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import * as view from "../src/ui/expenseFormPresentation.mjs";
const source=await readFile("src/app.mjs","utf8");
const escape=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function fn(name,next="function "){const start=source.indexOf("function "+name+"(");assert(start>=0);return source.slice(start,source.indexOf("\n"+next,start+1));}
function request({exists=true,editable=true,name='ארוחת ערב <בדיקה>'}={}){
 const event=exists?{id:"event",expenses:[{id:"expense",name,total:12000}]}:null;
 const ctx={getEvent:()=>event,canCurrentParticipantEdit:()=>editable,editBlockedMessage:()=>"קריאה בלבד",
  notice:"",render(){ctx.rendered=true;},formatEventMoney:()=>"₪120.00",openImportantActionDialog(config,trigger){ctx.config=config;ctx.trigger=trigger;}};
 runInNewContext(fn("requestExpenseDeletion","async function ")+'\nrequestExpenseDeletion("event","expense","trigger");',ctx);return ctx;
}
function render(dialog){
 return runInNewContext(fn("renderImportantActionDialog")+"\nrenderImportantActionDialog();",{
  importantActionDialog:dialog,escapeHtml:escape,escapeAttribute:escape,...view});
}
test("expense deletion separates context from a short accessible heading without a generic caption",()=>{
 const ctx=request(),html=render(ctx.config);
 assert.equal(ctx.config.title,"למחוק את ההוצאה?");
 assert.equal(ctx.config.label,null);
 assert.equal(ctx.config.expenseName,'ארוחת ערב <בדיקה>');
 assert.equal(ctx.config.expenseAmount,"₪120.00");
 assert(html.includes('<strong>ארוחת ערב &lt;בדיקה&gt;</strong>'));
 assert(html.includes('<bdi class="font-num">₪120.00</bdi>'));
 assert(!html.includes("פעולה חשובה"));assert(!html.includes("<בדיקה>"));
 assert.match(html,/<button class="primary-button"[^>]*data-action="cancel-important-action">ביטול/);
 assert.match(html,/role="alertdialog"[\s\S]*aria-describedby="expense-delete-context important-action-description"/);
 assert(html.includes("אי אפשר לבטל את המחיקה."));
 assert.equal(ctx.config.payload.eventId,"event");assert.equal(ctx.config.payload.expenseId,"expense");
 assert.equal(ctx.trigger,"trigger");
});
test("deletion request still enforces permissions and missing-expense guards before opening",()=>{
 const denied=request({editable:false});assert.equal(denied.config,undefined);assert.equal(denied.notice,"קריאה בלבד");assert(denied.rendered);
 assert.equal(request({exists:false}).config,undefined);
});
test("expense deletion presentation escapes long untrusted text and leaves other confirmation kinds intact",()=>{
 const ctx=request({name:'<img src=x onerror=alert(1)>'.repeat(10)}),html=render(ctx.config);
 assert(!html.includes("<img "));assert(html.includes("&lt;img"));assert.equal((html.match(/class="expense-delete-context"/g)||[]).length,1);
 const other=render({kind:"delete-event",title:"מחיקת אירוע",description:"הסבר",confirmLabel:"מחק אירוע"});
 assert(other.includes('aria-describedby="important-action-description"'));assert(other.includes("פעולה חשובה"));assert(!other.includes("expense-delete-context"));
 assert.match(other,/<button class="secondary-button"[^>]*data-action="cancel-important-action">ביטול/);
 const notes=render({kind:"discard-expense-notes",label:null,title:"לצאת בלי לשמור?",description:"שינויים",confirmLabel:"צא בלי לשמור",cancelLabel:"המשך לערוך"});
 assert(notes.includes("המשך לערוך"));assert(!notes.includes("expense-delete-context"));assert(!notes.includes("פעולה חשובה"));
});
