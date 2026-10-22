import {captureClosedSettlementDisclosureState,restoreClosedSettlementDisclosureState} from "../src/ui/closedSettlementPresentation.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {renderClosedFixture} from "./helpers/closedSettlementHarness.mjs";
import {renderClosedSettlementShareActionsView} from "../src/ui/closedSettlementPresentation.mjs";
import {formatSettlementSummary} from "../src/domain/settlementSummary.mjs";

const transfer=(from,to,amount,status="pending")=>({id:from+"-"+to,fromParticipantId:from,toParticipantId:to,amount,status});
const heroTotal=html=>html.match(/class="settlement-hero-amount amount"><span class="font-num">([^<]+)/)?.[1];

test("closed debts have two independent initially collapsed disclosures and one action set",()=>{
 const {html,footer}=renderClosedFixture();
 assert.equal(footer,"");assert.equal((html.match(/class="settlement-debt-share"/g)||[]).length,1);
 assert.equal((html.match(/class="settlement-debt-preview"/g)||[]).length,1);
 assert(!/<details[^>]*\bopen(?:\s|>)/.test(html));
 for(const action of ["share-whatsapp","copy-settlement","copy-event-report"])assert.equal((html.match(new RegExp('data-action="'+action+'"',"g"))||[]).length,1);
 assert(html.includes("שתף חובות"));assert(html.includes("הצג חובות"));
 assert(html.includes('data-action="reopen-event"'));
 const share=html.slice(html.indexOf('<details class="settlement-debt-share"'),html.indexOf('<details class="settlement-debt-preview"'));
 assert(!share.includes("settlement-share-message"));
});
test("personal receipts show one personal amount even when unrelated group debts exist",()=>{
 const {html}=renderClosedFixture({transfers:[transfer("guest-a","owner",8000),transfer("guest-b","owner",3000),transfer("guest-a","guest-b",2700)]});
 assert(html.includes(">צריכים להחזיר לך</h2>"));assert.equal(heroTotal(html),"₪110.00");
 assert(html.includes("2 העברות אליך שעדיין לא סומנו כשולמו."));
 assert(!html.includes("is-group-total"));assert(!html.includes("₪137.00"));
});
test("personal payments retain the payable total without netting unrelated debts",()=>{
 const {html}=renderClosedFixture({transfers:[transfer("owner","guest-a",8000),transfer("owner","guest-b",3000),transfer("guest-a","guest-b",2700)]});
 assert(html.includes(">עליך להעביר</h2>"));assert.equal(heroTotal(html),"₪110.00");
 assert(html.includes("2 העברות שעדיין לא סומנו כשולמו."));
});
test("mixed pay and receive keeps both amounts and explicitly labels the group total",()=>{
 const {html}=renderClosedFixture({transfers:[transfer("owner","guest-a",8000),transfer("guest-b","owner",3000),transfer("guest-a","guest-b",2700)]});
 assert(html.includes("₪80.00"));assert(html.includes("₪30.00"));assert.equal(heroTotal(html),"₪137.00");
 assert(html.includes("is-group-total"));assert(html.includes("נותר לתשלום בקבוצה"));assert(!html.includes("₪50.00"));
});
for(const reliable of [false,true])test("non-personal group summary never attributes other debts to the user; identity="+reliable,()=>{
 const {html}=renderClosedFixture({reliable,transfers:[transfer("guest-a","guest-b",8000),transfer("guest-b","guest-a",3000)]});
 assert(html.includes("is-group-total"));assert.equal(heroTotal(html),"₪110.00");
 assert(!html.includes(">צריכים להחזיר לך</h2>"));assert(!html.includes('data-action="mark-paid"'));
});
for(const paying of [false,true])test("single "+(paying?"payer":"receiver")+" retains transfer identity and completion handler",()=>{
 const t=paying?transfer("owner","guest-a",8000):transfer("guest-a","owner",8000);
 const {html}=renderClosedFixture({transfers:[t],names:["ירין","<דנה & לוי>","איתי"]});
 assert(html.includes('data-transfer-id="'+t.id+'"'));assert(html.includes('data-action="mark-paid"'));
 assert(html.includes(paying?">העברתי</button>":">קיבלתי</button>"));
 assert(html.includes(paying?"עליך להעביר":"צריכים להחזיר לך"));assert(html.includes("&lt;דנה &amp; לוי&gt;"));
 assert(html.includes(paying?"ל־&lt;דנה":"מ־&lt;דנה"));assert.equal((html.match(/₪80.00/g)||[]).length,1);
});
for(const transfers of [[],[transfer("guest-a","owner",8000,"paid")]])test("balanced and fully paid summaries have no remaining amount or payment action; count="+transfers.length,()=>{
 const {html}=renderClosedFixture({transfers});
 assert(html.includes(">הכול שולם</h2>"));assert(!html.includes('data-action="mark-paid"'));
 assert.equal(heroTotal(html),undefined);assert(html.includes("שתף סיכום"));assert(html.includes("הצג סיכום"));
 assert(html.includes("הכול סגור. אין העברות פתוחות."));
});
test("partial payment excludes paid debt from headline and canonical preview",()=>{
 const {html}=renderClosedFixture({transfers:[transfer("guest-a","owner",8000,"paid"),transfer("guest-b","owner",3000)]});
 assert(html.includes("₪30.00"));assert(!html.includes("80.00"));assert(!html.includes("דנה לוי"));
});
test("manager permission, open summary, empty and review guards remain intact",()=>{
 assert(!renderClosedFixture({manage:false}).html.includes('data-action="reopen-event"'));
 const open=renderClosedFixture({closedEvent:false});assert(open.html.includes("סיכום ביניים"));assert(open.footer.includes("שיתוף והעתקה"));
 assert(!open.html.includes("settlement-debt-preview"));assert(!open.html.includes('data-action="mark-paid"'));
 assert.equal(renderClosedFixture({empty:true}).html,"<div>empty</div>");
 const invalid=renderClosedFixture({closedEvent:false,review:true}).html;
 assert(invalid.includes("תקן הוצאות לפני סגירה"));assert(invalid.includes("disabled"));
});
const decode=s=>s.replace(/<[^>]*>/g,"").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&#039;","'").replaceAll("&amp;","&");
for(const currency of ["ILS","USD","THB"])for(const direct of [false,true])test("preview reproduces canonical pending lines, aliases, escaping and currency "+currency+" direct="+direct,()=>{
 const result=renderClosedFixture({currency,direct,aliases:{"guest-a":"דנה (חברה)"},names:["ירין","<img src=x onerror=alert(1)>","איתי"],transfers:[transfer("guest-a","owner",8000),transfer("guest-b","owner",3000,"paid")]});
 const summary=formatSettlementSummary({eventName:result.event.name,participants:result.participants,transfers:result.transfers,currency,participantAliases:result.event.participantAliases,directSettlementTransfers:direct});
 const actual=[...result.html.matchAll(/<p class="settlement-share-message-line">([\s\S]*?)<\/p>/g)].map(m=>decode(m[1]));
 assert.deepEqual(actual,summary.split("\n").filter(x=>x.startsWith("• ")));
 assert(result.html.includes('class="settlement-share-currency"'));assert(!result.html.includes("<img"));
});
test("share view escapes event identifiers and plain messages and never emits executable markup",()=>{
 const html=renderClosedSettlementShareActionsView({eventId:'id"><img src=x>',hasPendingTransfers:false,formattedSummary:"<script>alert(1)</script>"});
 assert(!html.includes("<img"));assert(!html.includes("<script>"));assert(html.includes('id&quot;&gt;&lt;img src=x&gt;'));
 assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});


function disclosureRoot({eventId="event",summary="same debts",shareOpen=false,previewOpen=false,closed=true}={}) {
 const share={open:shareOpen},preview={open:previewOpen},message={textContent:summary};
 const screen={dataset:{eventId},querySelector:selector=>selector===".settlement-share-message"?closed?message:null:selector===".settlement-debt-share"?share:preview};
 return {querySelector:()=>screen,share,preview,message};
}
test("unchanged debt summary restores independently open share and preview controls",()=>{
 for(const [shareOpen,previewOpen] of [[true,false],[false,true],[true,true],[false,false]]){
  const old=disclosureRoot({shareOpen,previewOpen}),snapshot=captureClosedSettlementDisclosureState(old),fresh=disclosureRoot();
  assert(restoreClosedSettlementDisclosureState(fresh,snapshot));
  assert.equal(fresh.share.open,shareOpen);assert.equal(fresh.preview.open,previewOpen);
 }
});
test("a different event or changed canonical debts never inherits open disclosures",()=>{
 const snapshot=captureClosedSettlementDisclosureState(disclosureRoot({shareOpen:true,previewOpen:true}));
 for(const options of [{eventId:"other"},{summary:"remaining debt changed"}]){
  const fresh=disclosureRoot(options);assert.equal(restoreClosedSettlementDisclosureState(fresh,snapshot),false);
  assert.equal(fresh.share.open,false);assert.equal(fresh.preview.open,false);
 }
});
test("open or empty summary has no closed disclosure state and no restoration side effects",()=>{
 const root=disclosureRoot({closed:false});
 assert.equal(captureClosedSettlementDisclosureState(root),null);
 assert.equal(restoreClosedSettlementDisclosureState(root,{eventId:"event",summary:"same debts",shareOpen:true}),false);
});
test("missing snapshot cannot open share or preview controls",()=>{
 const root=disclosureRoot();assert.equal(restoreClosedSettlementDisclosureState(root,null),false);
 assert.equal(root.share.open,false);assert.equal(root.preview.open,false);
});
