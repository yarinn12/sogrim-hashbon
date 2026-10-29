import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderEventInvitationChoicesView} from '../src/ui/eventInvitationChoices.mjs';
import {manualParticipantCopy} from '../src/ui/eventManualParticipantEditor.mjs';

test('invitation view retains all three route actions with the original event scope',()=>{
  const html=renderEventInvitationChoicesView({eventId:'event-123'});
  assert.equal((html.match(/<button /g)||[]).length,3);
  assert.equal((html.match(/data-event-id="event-123"/g)||[]).length,3);
  for(const text of ['data-action="open-event-share"','data-participant-view="friends"','data-participant-view="manual"','שתף קישור או QR','בחר מחברים','הוספה לפי שם'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/<form|<input|data-action="event-add-guest"|data-action="confirm-event-participant-add"/);
});
test('invitation manual explanation is the same approved source copy',()=>{
  const html=renderEventInvitationChoicesView({eventId:'event-123'});
  assert.ok(html.includes(manualParticipantCopy.explanation));
  assert.equal((html.match(/class="event-invitation-choice-hint"/g)||[]).length,3);
});
test('invitation view escapes event attributes without adding executable markup',()=>{
  const html=renderEventInvitationChoicesView({eventId:'"><img src=x onerror=alert(1)>'});
  assert.doesNotMatch(html,/<img/);assert.match(html,/&quot;&gt;&lt;img/);
  assert.equal((html.match(/<button /g)||[]).length,3);
});
test('invitation module is presentation-only and packaged in both offline lists',()=>{
  const view=readFileSync('src/ui/eventInvitationChoices.mjs','utf8'),sw=readFileSync('sw.js','utf8');
  assert.doesNotMatch(view,/from ["'].*(?:data|domain|server)\//);
  assert.equal(sw.split('"/src/ui/eventInvitationChoices.mjs"').length-1,2);
});
const source=readFileSync('src/app.mjs','utf8');
const dialogSource=source.slice(source.indexOf('function renderEventParticipantAddDialog('),source.indexOf('function renderEventOfflineParticipantRenameDialog('));
function harness(view='',canEdit=true){
  const event=Object.freeze({id:'event-123',name:'טיול לצפון',participantIds:Object.freeze(['owner','already'])});
  const participants=Object.freeze([
    {id:'owner',displayName:'אני',connected:true},{id:'already',displayName:'חבר קיים',connected:true},
    {id:'friend',displayName:'חבר נוסף',connected:true},{id:'offline-a',displayName:'אורח',connected:false},
    {id:'offline-b',displayName:' אורח ',connected:false},{id:'empty',displayName:' ',connected:false},
    {id:'hidden',displayName:'לא ברשימה',connected:true}
  ].map(Object.freeze));
  const calls={filter:[],routes:[],editors:[]};
  const context=vm.createContext({state:{participants},eventDialog:{eventId:event.id,kind:'participants-add',participantView:view,message:'הודעה'},
    canCurrentParticipantEdit:()=>canEdit,
    participantCandidateFilter:(ids,kind)=>{calls.filter.push({ids:Array.from(ids),kind});return p=>p.id!=='hidden'},
    participantConnectionStatus:p=>({connected:p.connected}),normalizeParticipantDisplayName:s=>String(s).trim(),
    compareEventParticipantRoster:(a,b)=>a.id.localeCompare(b.id),
    renderEventDialogShell:args=>args,escapeHtml:value=>String(value),
    renderEventParticipantAddRoutes:(...args)=>{calls.routes.push(args);return '<div data-routes></div>'},
    renderEventParticipantAddEditor:(...args)=>{calls.editors.push(args);return '<div data-editor></div>'}
  });
  vm.runInContext(dialogSource,context);
  return {result:context.renderEventParticipantAddDialog(event),calls,event};
}
test('invitation adapter preserves candidate filtering, deduplication and event scope',()=>{
  const{result,calls,event}=harness();
  assert.deepEqual(calls.filter,[{ids:['owner','already'],kind:'event-participant'}]);
  assert.equal(calls.routes[0][0],event);assert.deepEqual(Array.from(calls.routes[0][1],p=>p.id),['friend','offline-a']);assert.equal(calls.routes[0][2],true);
  assert.equal(result.description,event.name);assert.match(result.modalClass,/event-invitation-choice-screen/);
  assert.equal(result.backAction,'event-participants-back');assert.equal(result.backLabel,'חזרה למסך הקודם');
  assert.equal(result.routeMode,true);assert.equal(result.showClose,false);
});
for(const view of ['friends','manual'])test('invitation styling and context do not leak into the '+view+' editor',()=>{
  const{result,calls,event}=harness(view,false);
  assert.equal(calls.routes.length,0);assert.equal(calls.editors.length,1);
  assert.equal(calls.editors[0][0],event);assert.equal(calls.editors[0][2],false);assert.equal(calls.editors[0][3],view);
  assert.equal(result.description,view==='friends'?event.name:'');assert.doesNotMatch(result.modalClass,/event-invitation-choice-screen/);
  assert.equal(result.modalClass.includes('event-friends-picker-screen'),view==='friends');
  assert.equal(result.backAction,'event-participant-add-view-back');assert.equal(result.backLabel,'חזרה לדרכי ההוספה');
});
test('invitation route adapter passes only the event identifier into presentation',()=>{
  const start=source.indexOf('function renderEventParticipantAddRoutes('),end=source.indexOf('function renderExistingEventParticipantAction(',start),calls=[];
  const context=vm.createContext({renderEventInvitationChoicesView:model=>{calls.push(model);return 'choices'}});
  vm.runInContext(source.slice(start,end),context);
  assert.equal(context.renderEventParticipantAddRoutes({id:'event-123'},[],false),'choices');
  assert.equal(JSON.stringify(calls),JSON.stringify([{eventId:'event-123'}]));
});
