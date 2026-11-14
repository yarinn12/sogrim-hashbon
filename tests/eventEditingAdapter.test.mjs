import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(process.env.EVENT_EDITING_TEST_APP||'src/app.mjs','utf8');
const a=app.indexOf('function renderEventSettingsLockDialog('),b=app.indexOf('\nfunction ',a+5);assert(a>=0&&b>a);
const view=existsSync('src/ui/eventEditingPresentation.mjs')?await import('../src/ui/eventEditingPresentation.mjs'):{};
function render({locked=false,canManage=true}={}){const event={id:'event-scope',name:'סוף השבוע בצפון',locked},before=JSON.stringify(event);const r=runInNewContext(app.slice(a,b)+'\nrenderEventSettingsLockDialog(event)',{event,canCurrentParticipantManage:()=>canManage,renderEventEditingView:view.renderEventEditingView,renderEventDialogShell:m=>m});assert.equal(JSON.stringify(event),before);return r;}

test('editing route retains event scope and Back with the approved shared header',()=>{const r=render();assert.equal(r.eventId,'event-scope');assert.equal(r.title,'עריכת האירוע');assert.equal(r.description,'סוף השבוע בצפון');assert.equal(r.eyebrow,'');assert.equal(r.modalClass,'event-task-modal event-lock-screen');assert.equal(r.backAction,'event-settings-back');assert.equal(r.routeMode,true);assert.equal(r.settingsMode,true);assert.equal(r.showClose,false)});

test('editing keeps one explicit original action for open and closed state without duplicate status cards',()=>{for(const locked of[false,true]){const r=render({locked});assert.equal((r.body.match(/data-action="toggle-lock"/g)||[]).length,1);assert.match(r.body,/data-event-id="event-scope"/);assert(r.body.includes(locked?'פתח שוב לעריכה':'נעל את האירוע'));assert(r.body.includes(locked?'האירוע נעול לעריכה':'האירוע פתוח לעריכה'));assert(!r.body.includes('event-settings-card'));assert(!r.body.includes('status-chip'))}});

test('editing preserves original manager-only guard in both open and closed events',()=>{for(const canManage of[false,true])for(const locked of[false,true]){const r=render({canManage,locked});assert.equal((r.body.match(/ disabled/g)||[]).length,canManage?0:1)}});

test('editing explains readonly guard and describes the action consequence without mutation',()=>{for(const locked of[false,true])for(const canManage of[false,true]){const r=render({canManage,locked});assert.equal(r.body.includes('רק מנהלי האירוע יכולים לנעול או לפתוח עריכה.'),!canManage);assert.match(r.body,/aria-describedby="event-lock-state-description/);assert.match(r.body,/אפשר לפתוח שוב לעריכה בכל זמן\./)}});
