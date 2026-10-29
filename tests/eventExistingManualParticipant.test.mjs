import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as view from '../src/ui/eventManualParticipantEditor.mjs';
const source=readFileSync(process.env.EVENT_MANUAL_TEST_APP||'src/app.mjs','utf8');
function fn(name){const re=new RegExp('(?:async )?function '+name+'\\('),start=source.search(re),next=source.slice(start+1).search(/\r?\n(?:async )?function /);assert.ok(start>=0,name);return source.slice(start,next<0?source.length:start+1+next)}
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function editor(canEdit=true,value='אורן ישראלי'){
 const event=Object.freeze({id:'event-1'}),context=vm.createContext({eventDialog:Object.freeze({contactNameDraft:value}),escapeHtml:escape,escapeAttribute:escape,manualParticipantCopy:view.manualParticipantCopy,renderExistingEventManualParticipantEditorView:view.renderExistingEventManualParticipantEditorView});
 vm.runInContext(fn('renderEventParticipantAddEditor'),context);return context.renderEventParticipantAddEditor(event,[],canEdit,'manual');
}
test('existing manual editor has one approved explanation, a visible matching label and no duplicate heading',()=>{
 const html=editor();assert.match(html,/<label[^>]*for="event-offline-participant-name"[^>]*>שם המשתתף<\/label>/);assert.equal(html.split(view.manualParticipantCopy.explanation).length-1,1);assert.doesNotMatch(html,/<h2|participant-add-privacy-note/);assert.match(html,/aria-label="שם המשתתף"/);
});
test('existing manual editor retains action, event, draft, Enter and permission semantics',()=>{
 for(const canEdit of[false,true]){const html=editor(canEdit);const input=html.match(/<input[^>]+>/)?.[0],button=html.match(/<button[^>]+>/)?.[0];assert.ok(input&&button);assert.match(input,/data-action="event-guest-name"/);assert.match(input,/name="eventGuestName"/);assert.match(input,/enterkeyhint="done"/);assert.match(input,/value="אורן ישראלי"/);assert.match(button,/data-action="event-add-guest"/);assert.match(button,/data-event-id="event-1"/);assert.equal(/\bdisabled\b/.test(input),!canEdit);assert.equal(/\bdisabled\b/.test(button),!canEdit)}
});
test('manual dialog retains event context and the same Back destination without rendering the friends view',()=>{
 const event=Object.freeze({id:'event-1',name:'טיול בצפון',participantIds:Object.freeze(['owner'])});
 const context=vm.createContext({state:{participants:[]},eventDialog:{eventId:event.id,kind:'participants-add',participantView:'manual'},canCurrentParticipantEdit:()=>true,participantCandidateFilter:()=>()=>true,manualParticipantCopy:view.manualParticipantCopy,renderEventDialogShell:model=>model,renderEventParticipantAddEditor:()=>'<section>editor</section>'});vm.runInContext(fn('renderEventParticipantAddDialog'),context);const result=context.renderEventParticipantAddDialog(event);assert.equal(result.title,view.manualParticipantCopy.title);assert.equal(result.description,event.name);assert.match(result.modalClass,/event-manual-name-screen/);assert.doesNotMatch(result.modalClass,/event-friends-picker-screen/);assert.equal(result.backAction,'event-participant-add-view-back');assert.equal(result.showClose,false);
});
test('pure existing manual view escapes both draft values and event attributes',()=>{
 assert.equal(typeof view.renderExistingEventManualParticipantEditorView,'function');const html=view.renderExistingEventManualParticipantEditorView({eventId:'"><img src=x>',value:'" autofocus onfocus="bad <script> & \'name',canEdit:true});assert.doesNotMatch(html,/<img|<script|value="" autofocus/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&amp;/);assert.match(html,/&#039;/);assert.match(html,/data-event-id="&quot;&gt;&lt;img src=x&gt;"/);
});
test('pure existing manual view fails closed and leaves validation insertion between field and action',()=>{
 assert.equal(typeof view.renderExistingEventManualParticipantEditorView,'function');const html=view.renderExistingEventManualParticipantEditorView();assert.equal((html.match(/\bdisabled\b/g)||[]).length,2);assert.match(html,/<div class="event-participant-offline-form">[\s\S]*<input[^>]+>[\s\S]*<\/div>\s*<button/);assert.match(html,/value=""/);
});
test('manual renderer stays presentation-only and retains both offline inventory entries',()=>{
 const ui=readFileSync('src/ui/eventManualParticipantEditor.mjs','utf8'),sw=readFileSync('sw.js','utf8');assert.doesNotMatch(ui,/localStorage|sessionStorage|fetch\(|from ["'].*(?:data|domain|server)\//);assert.equal(sw.split('"/src/ui/eventManualParticipantEditor.mjs"').length-1,2);
});
test('existing add action rechecks edit permission before resolving or saving a typed participant',async()=>{
 const event=Object.freeze({id:'locked',participantIds:Object.freeze(['owner'])}),input={value:'אורן ישראלי',closest:()=>null},calls=[];
 const context=vm.createContext({app:{querySelector:()=>input},expenseDraft:null,eventDialog:null,notice:'',normalizeProfileName:s=>s,getEvent:()=>event,canCurrentParticipantEdit:()=>false,editBlockedMessage:()=> 'blocked',render:()=>calls.push('render'),reactivateDialogAfterRender:()=>calls.push('focus'),resolveOfflineParticipant:()=>{throw Error('Must not resolve')},persistState:()=>{throw Error('Must not write')}});vm.runInContext(fn('addGuestToEvent'),context);await context.addGuestToEvent('locked');assert.equal(context.notice,'blocked');assert.deepEqual(calls,['render','focus']);assert.deepEqual(event.participantIds,['owner']);
});
