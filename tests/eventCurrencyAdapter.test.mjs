import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(process.env.EVENT_CURRENCY_TEST_APP||'src/app.mjs','utf8');
const view=existsSync('src/ui/eventCurrencyPresentation.mjs')?await import('../src/ui/eventCurrencyPresentation.mjs'):{};
function render({canManage=true,hasExpenses=true,converted=false,locked=false}={}) {
 const event={id:'event-id',name:'סוף השבוע בצפון',currency:'ILS',expenses:hasExpenses?[{id:'expense',total:30000,...(converted?{fxConversion:{mode:'manual'}}:{})}]:[],locked};
 const before=JSON.stringify(event),seen=[];
 const from=app.indexOf('function renderEventSettingsCurrencyDialog('),to=app.indexOf('\nfunction renderEventSettingsRepaymentDialog',from);assert(from>=0&&to>from);
 const result=runInNewContext(app.slice(from,to)+'\nrenderEventSettingsCurrencyDialog(event)',{event,canCurrentParticipantManage:()=>canManage,renderEventCurrencyView:view.renderEventCurrencyView,renderEventDialogShell:m=>m,renderCurrencyOptions:currency=>{seen.push(currency);return '<option value="ILS" selected>Source currency</option>'}});
 assert.equal(JSON.stringify(event),before);assert.deepEqual(seen,['ILS']);return result;
}
test('currency route uses approved header and actual event context with original Back and sync scope',()=>{
 const r=render();assert.match(r.modalClass||'',/event-task-modal event-currency-screen/);assert.equal(r.eyebrow,'');assert.equal(r.title,'מטבע האירוע');assert.equal(r.description,'סוף השבוע בצפון');assert.equal(r.eventId,'event-id');assert.equal(r.backAction,'event-settings-back');assert.equal(r.routeMode,true);assert.equal(r.settingsMode,true);assert.equal(r.showClose,false);
});
test('currency route keeps its original permission and converted-expense guards, including existing lock semantics',()=>{
 for(const canManage of [true,false])for(const converted of [true,false])for(const locked of [true,false]){const r=render({canManage,converted,locked});assert.equal(/\sdisabled(?:\s|>)/.test(r.body),!canManage||converted);assert.match(r.body,/data-action="event-currency"/);assert.match(r.body,/data-event-id="event-id"/);assert.match(r.body,/<option value="ILS" selected>Source currency<\/option>/)}
});
test('currency route has one concise context-specific explanation with original restriction precedence',()=>{
 const cases=[[{},'הסכומים הקיימים לא יומרו. נבקש אישור לפני השינוי.'],[{hasExpenses:false},'זה המטבע שבו יוצגו ההוצאות וההחזרים באירוע.'],[{converted:true},'יש באירוע הוצאה שהומרה ממטבע אחר.'],[{canManage:false,converted:true},'רק מנהלי האירוע יכולים לשנות את המטבע.']];
 for(const[options,copy]of cases){const r=render(options);assert(r.body.includes(copy));assert.equal((r.body.match(/<small>/g)||[]).length,1);assert(!r.body.includes('event-settings-card'));assert.match(r.body,/באיזה מטבע מתחשבנים/)}
});
test('currency route supplies a scoped picker placeholder while retaining the native select contract',()=>{const r=render();assert.match(r.body,/data-choice-search-placeholder="מטבע או מדינה"/);assert.match(r.body,/name="eventCurrency"/);assert(!r.body.includes('data-action="confirm-important-action"'));});
