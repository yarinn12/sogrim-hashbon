import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { formatSourceAmount, parseSourceAmount } from "../src/domain/expenseFx.mjs";
import { currencyConfig, currencyOptions } from "../src/domain/currencies.mjs";

const source = await readFile("src/app.mjs", "utf8");
// Keep the regression executable against the legacy adapter as well as the extracted view.
const views = source.includes("renderExpenseFxFieldsView") ? await import("../src/ui/expenseFxPresentation.mjs") : {};
function section(start, end) {
 const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);
}
function harness(overrides={},previouslyOpen=false) {
 const event={id:"event",currency:"ILS"},draft={eventId:"event",total:"10",sourceCurrency:"USD",fxMode:"automatic",fxRate:"3.5",fxRateSource:"ExchangeRate-API Open Access",fxSourceDate:"2026-10-20",fxSourceUpdatedAt:"2026-10-20T10:00:00Z",fxNextUpdateAt:"2026-10-21T10:00:00Z",...overrides};
 const details={open:previouslyOpen},metadata={innerHTML:""},rate={value:draft.fxRate},refresh={disabled:false};
 const app={querySelector:s=>s.includes("expense-fx-details")?details:s==="[data-expense-fx-source]"?metadata:s.includes("expense-fx-rate")?rate:s.includes("expense-fx-refresh")?refresh:null};
 const context={...views,expenseDraft:draft,app,currencyConfig,currencyOptions,getEvent:()=>event,eventCurrency:e=>e.currency,expenseUsesForeignCurrency:()=>draft.sourceCurrency!==event.currency,expenseFxResult:()=>({total:3500,fxConversion:{sourceAmountMinorUnits:String(parseSourceAmount(draft.total,draft.sourceCurrency))}}),formatSourceAmount,formatEventMoney:()=>"₪35.00",formatFxUpdateTime:v=>v||"טרם התקבל",expenseFxSourceDescription:()=>"מקור קודם",escapeHtml:String,escapeAttribute:String,FX_OPEN_ACCESS_SOURCE:"ExchangeRate-API Open Access",FX_LEGACY_ECB_SOURCE:"ECB via Frankfurter v2",FX_OPEN_ACCESS_ATTRIBUTION_URL:"https://www.exchangerate-api.com",syncExpenseFxPreview(){},syncExpenseFlowActionState(){}};
 runInNewContext(section("function renderExpenseFxPreview(event)","function syncExpenseFxPreview()"),context);
 return {context,event,draft,details,metadata,rate,refresh,html:()=>context.renderExpenseFxFields(event)};
}

test("ordinary automatic FX keeps rate configuration inside a closed optional disclosure",()=>{
 const h=harness(),before=JSON.stringify(h.draft),html=h.html();
 const details=html.match(/<details\b[^>]*class="expense-fx-details"[\s\S]*?<\/details>/);
 assert(details,"ordinary FX needs optional conversion details instead of exposing every rate control");
 assert.doesNotMatch(details[0].slice(0,details[0].indexOf('>')),/\bopen\b/);
 for(const action of ["expense-fx-rate","expense-fx-manual","expense-fx-automatic","expense-fx-refresh"]) assert(details[0].includes('data-action="'+action+'"'));
 const outside=html.replace(details[0],"");assert.match(outside,/₪35\.00/);assert.match(outside,/ExchangeRate-API/);assert.doesNotMatch(outside,/data-action="expense-fx-(?:rate|manual|automatic|refresh)"/);assert.equal(JSON.stringify(h.draft),before);
});

test("manual and unavailable-rate drafts expose recovery without modifying the draft",()=>{
 for(const overrides of [{fxMode:"manual",fxRateSource:"user"},{fxError:"לא ניתן לקבל שער כעת. אפשר להזין שער אישי.",fxRate:""}]) {
  const h=harness(overrides),before=JSON.stringify(h.draft);assert.match(h.html(),/<details\b[^>]*class="expense-fx-details"[^>]*\bopen\b/);assert.equal(JSON.stringify(h.draft),before);
 }
});

test("rerendering conversion details preserves an explicitly opened automatic section",()=>{
 const h=harness({},true);assert.match(h.html(),/<details\b[^>]*class="expense-fx-details"[^>]*\bopen\b/);
});

test("an empty amount uses a plain prompt instead of a technical currency error",()=>{
 const h=harness({total:""});assert.match(h.context.renderExpenseFxPreview(h.event),/הזינו סכום להצגת ההמרה/);assert.doesNotMatch(h.context.renderExpenseFxPreview(h.event),/₪35/);
});

test("an asynchronous quote failure opens the existing details and retains entered amounts",()=>{
 const h=harness({fxError:"אפשר להזין שער אישי",fxRate:""});runInNewContext(section("function syncExpenseFxControls()","async function requestExpenseAutomaticRate("),h.context);h.context.syncExpenseFxControls();assert.equal(h.details.open,true);assert.equal(h.draft.total,"10");assert.equal(h.rate.value,"");
});
