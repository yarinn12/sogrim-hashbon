import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {renderSettlementCloseConfirmationView} from "../src/ui/settlementClosePresentation.mjs";

const app = await readFile("src/app.mjs", "utf8");
function adapter() {
 const start=app.indexOf("function renderSettlementCloseConfirmation(");
 const end=app.indexOf("\nfunction renderTransferRow(",start);
 assert(start>=0&&end>start);
 return app.slice(start,end);
}
function render(count) {
 const event={id:"event-id",expenses:[{id:"expense",total:24000}]};
 const transfers=Array.from({length:count},(_,i)=>({id:"t"+i,amount:1000,status:"pending"}));
 const before=JSON.stringify({event,transfers});
 const calls=[];
 const html=runInNewContext(adapter()+"\nrenderSettlementCloseConfirmation(event, transfers, 11000)",{
  event,transfers,renderSettlementCloseConfirmationView,
  formatEventMoney:(e,total)=>{calls.push({id:e.id,total});return "₪110.00";},
  renderEventRoutePrimaryNav:()=>'<nav data-original-navigation></nav>',
  escapeHtml:v=>String(v),iconSvg:()=>"<svg></svg>"
 });
 assert.deepEqual(calls,[{id:"event-id",total:11000}]);
 assert.equal(JSON.stringify({event,transfers}),before);
 return html;
}
test("close confirmation separates clear singular/plural copy from the unchanged formatted total",()=>{
 for(const count of [1,2]){
  const html=render(count);
  assert(html.includes('>לסגור את האירוע?</h2>'));
  assert(html.includes(count===1?"העברה אחת בסך":"2 העברות בסך"));
  assert(html.includes('<bdi dir="ltr" class="font-num">₪110.00</bdi>'));
  assert(html.includes("ההוצאות יינעלו לעריכה ותוכלו לסמן תשלומים שבוצעו. יישלח עדכון למשתתפים באפליקציה."));
  assert(!html.includes("יישלחו לתשלום"));
  assert(html.includes('data-original-navigation'));
 }
});
test("close confirmation retains accessible relationships and the original action payloads",()=>{
 const html=render(2);
 assert.match(html,/role="alertdialog"\s+aria-modal="true"/);
 assert(html.includes('aria-labelledby="settlement-close-confirmation-title"'));
 assert(html.includes('aria-describedby="settlement-close-confirmation-summary settlement-close-confirmation-description"'));
 assert(html.includes('id="settlement-close-confirmation-title" tabindex="-1"'));
 assert.equal((html.match(/data-action="cancel-close-event-confirmation"/g)||[]).length,2);
 assert(html.includes('data-action="confirm-close-event" data-allow-offline-mutation="true"'));
 assert(html.includes('data-event-id="event-id">סגור אירוע</button>'));
 assert(html.includes('aria-label="סגירת חלון האישור"'));
});
test("close confirmation escapes untrusted identifiers and formatted values without changing them",()=>{
 const model={eventId:'id"><img src=x>',pendingCount:1,formattedTotal:'<&"₪>',navigationHtml:"<nav></nav>"};
 const before=structuredClone(model),html=renderSettlementCloseConfirmationView(model);
 assert(html.includes('data-event-id="id&quot;&gt;&lt;img src=x&gt;"'));
 assert(html.includes('&lt;&amp;&quot;₪&gt;'));
 assert(!html.includes("<img"));assert.deepEqual(model,before);
});
