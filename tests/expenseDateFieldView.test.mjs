import test from "node:test";
import assert from "node:assert/strict";
import {expenseDateCaption,renderExpenseDateFieldView,openExpenseDatePicker,syncExpenseDateCaption} from "../src/ui/expenseFormPresentation.mjs";

test('expense date display preserves calendar components without timezone conversion',()=>{
 for(const [value,expected] of [['2026-10-20','20.10.2026'],['2024-02-29','29.02.2024'],['2026-01-01','01.01.2026'],['0099-12-31','31.12.0099'],['','בחירת תאריך'],[null,'בחירת תאריך'],['20/10/2026','בחירת תאריך']])assert.equal(expenseDateCaption(value),expected);
});
test('expense date markup escapes every supplied attribute and preserves its ISO value',()=>{
 const model={value:'2026-10-20',label:'תאריך "<בדיקה>',extraClass:'review "<bad>'},before=structuredClone(model),html=renderExpenseDateFieldView(model);
 assert.match(html,/value="2026-10-20"/);assert.match(html,/data-action="expense-date"/);assert.match(html,/tabindex="-1"/);assert.match(html,/dir="ltr">20\.10\.2026/);assert(html.includes('&quot;&lt;בדיקה&gt;'));assert(html.includes('review &quot;&lt;bad&gt;'));assert(!html.includes('<bad>'));assert.deepEqual(model,before);
});
test('expense date button uses the real picker and preserves editable fallback and disabled state',()=>{
 for(const mode of ['native','missing','throwing','disabled']){
  const calls=[],classes=[];const input={matches:()=>mode==='disabled',focus:()=>calls.push('focus'),click:()=>calls.push('click'),tabIndex:-1};
  if(mode!=='missing')input.showPicker=()=>{calls.push('showPicker');if(mode==='throwing')throw Object.assign(new Error('unsupported'),{name:'NotSupportedError'});};
  const control={querySelector:()=>input,classList:{add:c=>classes.push(c)}};openExpenseDatePicker({closest:()=>control});
  if(mode==='native'){assert.deepEqual(calls,['focus','showPicker']);assert.deepEqual(classes,[]);assert.equal(input.tabIndex,-1);}
  else if(mode==='disabled'){assert.deepEqual(calls,[]);assert.deepEqual(classes,[]);}
  else {assert(calls.includes('focus'));assert.equal(calls.at(-1),'click');assert.deepEqual(classes,['is-native-date-fallback']);assert.equal(input.tabIndex,0);}
 }
});
test('expense date changes update both visible caption and accessible button name',()=>{
 const caption={textContent:''},attributes={},button={setAttribute:(name,value)=>attributes[name]=value};const control={dataset:{dateLabel:'תאריך ההוצאה'},querySelector:s=>s==='button'?button:caption};
 for(const value of ['2026-10-21','']){const input={value,closest:()=>control};syncExpenseDateCaption(input);assert.equal(caption.textContent,expenseDateCaption(value));assert.equal(attributes['aria-label'],'תאריך ההוצאה: '+expenseDateCaption(value));assert.equal(input.value,value);}
});
