import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync('src/app.mjs','utf8');
const start=app.indexOf('function renderEventSettingsDialog('),end=app.indexOf('\nfunction renderEventParticipantIdentityDialog(',start);
assert(start>=0&&end>start);
const view=existsSync('src/ui/eventSettingsOverviewPresentation.mjs')?await import('../src/ui/eventSettingsOverviewPresentation.mjs'):{};
function render(overrides={},manage=true){
 const event={id:'event-id',name:'אירוע בדיקה',currency:'ILS',adminsCanEditOnly:false,locked:false,...overrides},before=JSON.stringify(event),rows=[];
 const result=runInNewContext(app.slice(start,end)+'\nrenderEventSettingsDialog(event)',{
  event,state:{currentParticipantId:'owner'},canCurrentParticipantManage:()=>manage,canLeaveEvent:()=>true,eventAdminIds:()=>['owner'],participantName:()=> 'מנהל',currencySelectLabel:()=> 'שקל ישראלי (₪)',usesDirectSettlementTransfers:e=>!!e.directSettlementTransfers,usesRoundedSettlementTransfers:e=>!!e.roundSettlementTransfers,
  renderEventSettingsOverviewView:view.renderEventSettingsOverviewView,renderEventDialogShell:model=>model,
  renderEventSettingsMenuItem:row=>{rows.push({...row});return `<button data-settings-section="${row.section}">${row.title} ${row.description}</button>`},escapeAttribute:s=>String(s),escapeHtml:s=>String(s)
 });
 assert.equal(JSON.stringify(event),before,'presentation must not mutate event');return {result,rows};
}
test('settings overview uses the approved header family with actual event context and original Back contract',()=>{
 const {result:r}=render();assert.match(r.modalClass,/settings-overview-screen/);assert.equal(r.eyebrow,'');assert.equal(r.description,'אירוע בדיקה');assert.equal(r.title,'הגדרות האירוע');assert.equal(r.eventId,'event-id');assert.equal(r.backAction,'close-event-dialog');assert.equal(r.backLabel,'חזרה לאירוע');assert.equal(r.showClose,false);assert.equal(r.routeMode,true);assert.equal(r.settingsMode,true);
});
test('settings overview shows current values and all seven original destinations without changing state',()=>{
 for(const direct of [false,true])for(const rounded of [false,true]){
  const {rows}=render({directSettlementTransfers:direct,roundSettlementTransfers:rounded,locked:true,adminsCanEditOnly:true});
  assert.deepEqual(rows.map(r=>r.section),['management','currency','repayment','rounding','activity','lock','danger']);assert(rows.every(r=>r.eventId==='event-id'));
  assert.equal(rows[0].description,'ניהול מרוכז');assert.equal(rows[1].description,'שקל ישראלי (₪)');assert.equal(rows[2].description,direct?'לפי מי ששילם':'קיזוז בין כולם');assert.equal(rows[3].description,rounded?'סכומים שלמים בהחזרים':'ללא עיגול');assert.equal(rows[5].description,'נעול לעריכה');assert.equal(rows[6].description,'אישור נדרש לפני ביצוע');assert.equal(rows[6].danger,true);
 }
});
test('settings photo controls are keyboard reachable while retaining distinct original camera/gallery inputs',()=>{
 const {result:r}=render();assert.equal((r.body.match(/role="button" tabindex="0" aria-disabled="false"/g)||[]).length,2);assert.equal((r.body.match(/data-action="event-cover-image"/g)||[]).length,2);assert.equal((r.body.match(/capture="environment"/g)||[]).length,1);assert.equal((r.body.match(/accept="image\/\*"/g)||[]).length,2);assert(!r.body.includes('remove-event-cover'));
});
test('settings read-only presentation retains source management guards for both inputs and image removal',()=>{
 const {result:r}=render({coverImage:'/synthetic.jpg'},false);assert.equal((r.body.match(/role="button" tabindex="-1" aria-disabled="true"/g)||[]).length,2);assert.equal((r.body.match(/hidden disabled/g)||[]).length,2);assert(!r.body.includes('remove-event-cover'));assert(r.body.includes('שינוי תמונה דורש הרשאת ניהול.'));
 const allowed=render({coverImage:'/synthetic.jpg'}).result.body;assert(allowed.includes('data-action="remove-event-cover" data-event-id="event-id"'));
});
