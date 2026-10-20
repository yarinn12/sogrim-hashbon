import test from "node:test";
import assert from "node:assert/strict";
import { expenseFxCurrencyNames, renderExpenseFxFieldsView, renderExpenseFxPreviewView, renderExpenseFxSourceMetadataView } from "../src/ui/expenseFxPresentation.mjs";

const names=expenseFxCurrencyNames({source:{id:"USD",label:"דולר אמריקאי"},target:{id:"ILS",label:"שקל ישראלי"}});
const model=()=>({sourceCurrency:"USD",foreign:true,options:[{id:"USD",label:"דולר אמריקאי"}],error:"",automatic:true,manual:false,rate:"3.5",names,preview:{amount:"10",...names,value:"₪35.00",automatic:true},expanded:false,metadata:{kind:"open-access",updatedAt:"20.10 10:00",nextUpdateAt:"21.10 10:00"},attributionUrl:"https://www.exchangerate-api.com"});

test("FX names describe the selected currencies and one source unit in readable Hebrew",()=>{
 for(const [source,target,from,to,unit] of [[{id:"USD",label:"דולר אמריקאי"},{id:"ILS",label:"שקל ישראלי"},"דולר אמריקאי","שקלים","דולר אמריקאי אחד"],[{id:"THB",label:"באט"},{id:"USD",label:"דולר אמריקאי"},"באט","דולר אמריקאי","באט אחד"],[{id:"TRY",label:"לירה טורקית"},{id:"ILS",label:"שקל ישראלי"},"לירה טורקית","שקלים","לירה טורקית אחת"]]) assert.deepEqual(expenseFxCurrencyNames({source,target}),{sourceName:from,targetName:to,sourceUnit:unit});
});

test("FX views preserve source precision and input identity without mutating the model",()=>{
 const m=model();m.rate="0.000119";m.preview.amount="1.234";m.automatic=false;m.manual=true;m.expanded=true;const before=JSON.stringify(m);const html=renderExpenseFxFieldsView(Object.freeze(m));
 for(const attr of ['data-action="expense-fx-rate"','name="expenseFxRate"','inputmode="decimal"','value="0.000119"']) assert(html.includes(attr));assert.doesNotMatch(html,/\breadonly\b/);assert.match(html,/1\.234/);assert.equal(JSON.stringify(m),before);
});

test("FX views escape untrusted messages, labels, amounts and rate attributes",()=>{
 const m=model();m.rate='3.5" onfocus="bad';m.names={sourceName:'<img src=x>',targetName:'ILS & USD',sourceUnit:'" unsafe'};m.options=[{id:'USD" data-x="bad',label:'<script>bad</script>'}];m.preview={amount:'1" data-x="bad',...m.names,message:'<img src=x onerror=bad>',error:true};
 const html=renderExpenseFxFieldsView(m);assert.doesNotMatch(html,/<img|<script|" onfocus="bad|" data-x="bad/);assert.match(html,/&lt;img/);assert.match(html,/3\.5&quot; onfocus=&quot;bad/);assert.match(renderExpenseFxPreviewView({...m.preview,value:'<img src=x>'}),/&lt;img/);
});

test("FX provenance identifies Open Access and retains legacy ECB attribution separately",()=>{
 assert.match(renderExpenseFxSourceMetadataView({kind:"open-access",updatedAt:"now",nextUpdateAt:"next"}),/data-fx-provider="open-access"/);
 const legacy=renderExpenseFxSourceMetadataView({kind:"legacy-ecb",sourceDate:"2026-10-20"});assert.match(legacy,/ECB דרך Frankfurter v2/);assert.doesNotMatch(legacy,/open-access|ExchangeRate-API/);assert.equal(renderExpenseFxSourceMetadataView({kind:"manual"}),"שער אישי");
 assert.equal(renderExpenseFxPreviewView(null),"");assert.doesNotMatch(renderExpenseFxFieldsView({...model(),foreign:false,preview:null}),/expense-fx-details|expense-fx-rate/);
});

test("an unselected FX mode does not imply an editable personal rate",()=>{
 const m={...model(),automatic:false,manual:false};const html=renderExpenseFxFieldsView(m);assert.match(html,/<input[^>]*data-action="expense-fx-rate"[^>]*readonly/);assert.doesNotMatch(html,/aria-pressed="true"/);
});
