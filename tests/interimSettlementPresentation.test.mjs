import test from "node:test";import assert from "node:assert/strict";import {readFile} from "node:fs/promises";import {runInNewContext} from "node:vm";
import * as presentation from "../src/ui/eventSettlementOptions.mjs";
const app=await readFile("src/app.mjs","utf8");
function extract(name){const start=app.indexOf("function "+name+"(");assert(start>=0);const after=app.slice(start);const next=/\n(?:async )?function /.exec(after);return next?after.slice(0,next.index):after;}
const row=extract("renderTransferRow");
const start=row.indexOf("const pendingStatusText ="),end=row.indexOf(";",start);assert(start>=0&&end>start);
function status({closed=false,personal=true,paying=false}={}){
 return runInNewContext(row.slice(start,end+1)+"\npendingStatusText",{paymentActionsEnabled:closed,isPersonal:personal,isCurrentParticipantPaying:paying});
}
test("open personal transfer labels are provisional for both payer and receiver",()=>{
 assert.equal(status({paying:true}),"יתרה זמנית");
 assert.equal(status({paying:false}),"יתרה זמנית");
 assert.equal(status({personal:false}),"יתרה זמנית");
});
test("closed transfers retain the distinct payer, receiver and group pending states",()=>{
 assert.equal(status({closed:true,paying:true}),"מחכה שתעביר");
 assert.equal(status({closed:true,paying:false}),"מחכה שיגיע");
 assert.equal(status({closed:true,personal:false}),"ממתין להעברה");
});
const escape=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function render({closed=false,review=false,single=false,manage=true,empty=false}={}){
 const event={id:"event",expenses:empty?[]:[{id:"expense",total:24000}],locked:closed};
 const transfers=[{id:"a",fromParticipantId:"guest-a",toParticipantId:"owner",amount:8000,status:"pending"},...single?[]:[{id:"b",fromParticipantId:"guest-b",toParticipantId:"owner",amount:3000,status:"pending"}]];
 const before=JSON.stringify({event,transfers});
 const ctx={event,transfers,issues:review?["invalid"]:[],pendingTotal:11000,state:{currentParticipantId:"owner"},
  hasReliableSettlementIdentity:()=>true,isEventClosed:()=>closed,canCurrentParticipantManage:()=>manage,
  sumMoneyAmounts:a=>a.reduce((n,x)=>n+x,0),formatEventMoney:(_e,n)=>"₪"+(n/100).toFixed(2),
  formatCount:(n,_one,many)=>n+" "+many,participantName:()=>'<אורח>',escapeHtml:escape,escapeAttribute:escape,
  renderEventEmptyExpenseState:()=>"<div>empty</div>",...presentation};
 const html=runInNewContext(extract("renderSettlementHero")+"\n"+extract("renderFeaturedSettlementHero")+"\nrenderSettlementHero(event,transfers,pendingTotal,issues);",ctx);
 assert.equal(JSON.stringify({event,transfers}),before,"rendering never mutates expense amounts or transfers");return html;
}
test("ordinary and single-transfer open summaries use the approved interim copy without payment completion",()=>{
 for(const single of [false,true]){
  const html=render({single});assert(html.includes("סיכום ביניים"));assert(html.includes('data-settlement-phase="interim"'));
  assert(html.includes(">סגור אירוע</button>"));assert(!html.includes("בואו נסגור חשבון"));assert(!html.includes('data-action="mark-paid"'));
  if(!single)assert(html.includes("הסכומים עשויים להשתנות. מתחשבנים אחרי סגירת האירוע."));
 }
});
test("closed, validation, empty and non-manager summary states keep their original guards",()=>{
 const closed=render({closed:true});assert(closed.includes('data-settlement-phase="existing"'));assert(!closed.includes("סיכום ביניים"));
 assert(render({closed:true,single:true}).includes('data-action="mark-paid"'));
 const invalid=render({review:true});assert(invalid.includes("תקן הוצאות לפני סגירה"));assert(invalid.includes('disabled'));assert(invalid.includes('data-settlement-phase="existing"'));
 const readonly=render({manage:false});assert(!readonly.includes('data-action="close-event"'));assert(readonly.includes("זמינה למנהל האירוע"));
 assert.equal(render({empty:true}),"<div>empty</div>");
});
