import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync('src/app.mjs','utf8');
const extract=(from,to)=>{const a=app.indexOf(from),e=app.indexOf(to,a);assert(a>=0&&e>a);return app.slice(a,e)};
const view=existsSync('src/ui/eventManagementPresentation.mjs')?await import('../src/ui/eventManagementPresentation.mjs'):{};
function render({canManage=true,locked=false,admins=['נועם'],mode='collaborative'}={}){
 const event={id:'event-id',name:'סוף השבוע בצפון',locked},before=JSON.stringify(event);const result=runInNewContext(extract('function renderEventManagementOptions(', '\nfunction renderForwardChevron(')+'\n'+extract('function renderEventSettingsManagementDialog(', '\nfunction renderEventSettingsCurrencyDialog(')+'\nrenderEventSettingsManagementDialog(event)',{
  event,state:{},canCurrentParticipantManage:()=>canManage,eventAdminIds:()=>admins,participantName:n=>n,eventManagementMode:()=>mode,renderEventManagementView:view.renderEventManagementView,renderEventDialogShell:m=>m,iconSvg:()=>'<svg data-source-check></svg>',escapeHtml:s=>String(s),EVENT_MANAGEMENT_CENTRALIZED:'centralized',EVENT_MANAGEMENT_COLLABORATIVE:'collaborative'
 });assert.equal(JSON.stringify(event),before);return result;
}
test('management route uses approved header/event context and retains original route and Back contract',()=>{
 const r=render();assert.match(r.modalClass,/event-task-modal event-management-screen/);assert.equal(r.eyebrow,'');assert.equal(r.title,'אופן ניהול');assert.equal(r.description,'סוף השבוע בצפון');assert.equal(r.eventId,'event-id');assert.equal(r.backAction,'event-settings-back');assert.equal(r.routeMode,true);assert.equal(r.settingsMode,true);assert.equal(r.showClose,false);
});
test('management radio copy is neutral to viewer identity and keeps both original action IDs and one selection',()=>{
 for(const mode of ['centralized','collaborative']){const r=render({mode});assert(r.body.includes('ניהול מרוכז'));assert(r.body.includes('ניהול משותף'));assert(!r.body.includes('אני מנהל עבור כולם'));assert.equal((r.body.match(/data-action="set-event-management-mode"/g)||[]).length,2);assert.equal((r.body.match(/role="radio"/g)||[]).length,2);assert.equal((r.body.match(/aria-checked="true"/g)||[]).length,1);assert.equal((r.body.match(/tabindex="0"/g)||[]).length,1);assert(r.body.includes('data-management-mode="'+mode+'"'));assert(r.body.includes('data-event-id="event-id"'));}
});
test('nonmanager and locked routes retain source disabled guards and explain their actual restriction',()=>{
 for(const canManage of [false,true])for(const locked of [false,true]){const r=render({canManage,locked});assert.equal((r.body.match(/\sdisabled/g)||[]).length,!canManage||locked?2:0);if(locked)assert(r.body.includes('האירוע נעול. צריך לפתוח עריכה לפני שמשנים את אופן הניהול.'));else if(!canManage)assert(r.body.includes('רק מנהלי האירוע יכולים לשנות את אופן הניהול.'));}
});
test('management identity context uses source names with correct singular/plural copy below the choices',()=>{
 for(const admins of [['נועם'],['נועם','דנה']]){const r=render({admins});assert(r.body.includes(admins.length>1?'מנהלי האירוע:':'מנהל האירוע:'));assert(r.body.includes(admins.join(', ')));assert(r.body.indexOf('event-management-admins')>r.body.indexOf('role="radiogroup"'));}
});
