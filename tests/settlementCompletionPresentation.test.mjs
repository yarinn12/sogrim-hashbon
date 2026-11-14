import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {renderSettlementCompletionView} from "../src/ui/settlementCompletionPresentation.mjs";
import {iconSvg} from "../src/uiIcons.mjs";

const app=await readFile("src/app.mjs","utf8"),start=app.indexOf("function renderSettlementCelebration()"),end=app.indexOf("\nfunction renderEventStatusMenu()",start);
assert(start>=0&&end>start);
function render({active=true,event={id:"event",locked:true,transfers:[{id:"one",amount:8000,status:"paid"},{id:"two",amount:3000,status:"paid"}]}}={}){
 const before=JSON.stringify(event),html=runInNewContext(app.slice(start,end)+"\nrenderSettlementCelebration()",{settlementCelebration:active?{eventId:"event"}:null,getEvent:()=>event,isEventClosed:e=>!!e.locked,renderSettlementCompletionView});
 assert.equal(JSON.stringify(event),before,"completion rendering never changes financial data");return html;
}

test("completion never appears without an active request and a nonempty fully paid event",()=>{
 for(const options of [{active:false},{event:null},{event:{id:"event",transfers:[]}},{event:{id:"event",transfers:[{status:"pending"}]}},{event:{id:"event",transfers:[{status:"paid"},{status:"pending"}]}}])assert.equal(render(options),"");
});

test("completion uses one clear marked-paid message and the shared undecorated check",()=>{
 const html=render();assert.equal((html.match(/<h2 /g)||[]).length,1);assert.equal((html.match(/<p /g)||[]).length,1);
 assert(html.includes('>הכול שולם</h2>'));assert(html.includes('>כל התשלומים באירוע סומנו כשולמו.</p>'));assert(html.includes(iconSvg("check")));assert(!html.includes("settlement-confetti"));assert(!html.includes("settlement-celebration-eyebrow"));assert(!html.includes("הכול נסגר"));
});

test("completion keeps the same destinations and closed/open primary labels",()=>{
 for(const isClosed of [false,true]){
  const html=renderSettlementCompletionView({eventId:"event-id",isClosed});assert(html.includes('data-action="archive-settled-event"'));assert(html.includes('data-event-id="event-id"'));assert(html.includes('>'+ (isClosed?"חזרה לאירועים":"סגור חשבון")+'</button>'));assert(html.includes('data-action="dismiss-settlement-celebration"'));assert(html.includes('>הישאר בסיכום</button>'));
 }
});

test("completion retains dialog semantics and announces its concise title and description",()=>{
 const html=render();assert.match(html,/role="dialog"\s+aria-modal="true"/);assert(html.includes('aria-labelledby="settlement-celebration-title"'));assert(html.includes('aria-describedby="settlement-celebration-description"'));assert(html.includes('id="settlement-celebration-title"'));assert(html.includes('id="settlement-celebration-description"'));assert(html.includes('tabindex="-1"'));
});

test("completion escapes untrusted event identifiers and leaves the display model unchanged",()=>{
 const model={eventId:'id"><img src=x>&',isClosed:true},before=structuredClone(model),html=renderSettlementCompletionView(model);assert(html.includes('data-event-id="id&quot;&gt;&lt;img src=x&gt;&amp;"'));assert(!html.includes('<img'));assert.deepEqual(model,before);
});

test("completion presentation remains available in both offline module inventories",async()=>{
 const sw=await readFile("sw.js","utf8");assert.equal((sw.match(/"\/src\/ui\/settlementCompletionPresentation\.mjs"/g)||[]).length,2);
});
