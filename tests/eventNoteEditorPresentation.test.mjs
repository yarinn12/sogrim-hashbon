import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {renderEventNoteEditorView} from '../src/ui/eventNoteEditorPresentation.mjs';
import {renderEventNoteDeleteConfirmationView} from '../src/ui/eventNoteDeleteConfirmationPresentation.mjs';

const model=Object.freeze({eventId:'scope',eventName:'אירוע בדיקה',noteId:'note-two',title:'עריכת פתק',isNew:false,canEdit:true,locked:false,pendingDeletion:false,saving:false,error:'',titleDraft:'פרטי הלינה',bodyDraft:'יום חמישי\nרחוב הדקל 12',pinned:true,storedPinned:true,maxTitleLength:180,maxBodyLength:12000});
const render=overrides=>{let result;renderEventNoteEditorView({...model,...overrides},{renderEventDialogShell:value=>(result=value,'shell')});return result};

test('new note uses the approved route header, normal back action and original form field contracts',()=>{
 const view=render({isNew:true,noteId:undefined,title:'פתק חדש',titleDraft:'',bodyDraft:'',pinned:false});
 assert.equal(view.title,'פתק חדש');assert.equal(view.description,model.eventName);assert.equal(view.routeMode,true);assert.equal(view.settingsMode,true);assert.equal(view.showClose,false);assert.equal(view.backAction,'close-event-dialog');assert.equal(view.backLabel,'חזרה לפתקים');assert.match(view.modalClass,/event-note-modal/);assert.match(view.modalClass,/event-note-screen/);
 assert.match(view.body,/class="event-note-editor" data-event-id="scope" data-note-id=""/);assert.match(view.body,/name="eventNoteTitle" maxlength="180"/);assert.match(view.body,/name="eventNoteBody" maxlength="12000"/);assert.match(view.body,/data-action="save-event-note"[^>]*>צור פתק/);assert.doesNotMatch(view.body,/request-delete-event-note/);assert.match(view.body,/אחרי השמירה/);
});

test('edit keeps the full body and separates the primary save action from deletion',()=>{
 const body=render().body;assert.match(body,/יום חמישי\nרחוב הדקל 12/);assert.match(body,/aria-pressed="true"/);assert.match(body,/event-note-pin-check/);assert.match(body,/שמור שינויים/);assert.match(body,/data-action="request-delete-event-note" data-event-id="scope" data-note-id="note-two"/);assert.ok(body.indexOf('data-action="save-event-note"')<body.indexOf('data-action="request-delete-event-note"'));assert.doesNotMatch(body,/הפתק מוצמד/);
});

test('closed and permission-limited notes expose selectable full content without mutation controls',()=>{
 const full='מידע ארוך לקבוצה.\n'.repeat(30);
 for(const locked of [true,false]){const view=render({canEdit:false,locked,bodyDraft:full});assert.match(view.body,/event-note-readonly-content/);assert.ok(view.body.includes(full));assert.doesNotMatch(view.body,/<form|<input|<textarea|save-event-note|toggle-event-note-pin|request-delete-event-note/);assert.match(view.body,locked?/האירוע סגור/:/אין לך הרשאה/)}
});

test('pending deletion retains readonly fields, disabled save/pin and an enabled deletion retry',()=>{
 const body=render({pendingDeletion:true}).body;assert.match(body,/<input[^>]*readonly/);assert.match(body,/<textarea[^>]*readonly/);assert.match(body,/data-action="toggle-event-note-pin"[^>]*disabled/);assert.match(body,/data-action="save-event-note"[^>]*disabled/);const remove=body.match(/<button[^>]*data-action="request-delete-event-note"[^>]*>/)?.[0];assert.ok(remove);assert.doesNotMatch(remove,/disabled/);assert.match(body,/נסה שוב למחוק/);
});

test('save-in-progress and validation feedback preserve the existing editor state contracts',()=>{
 const body=render({saving:true,error:'בעיה <במידע>'}).body;assert.match(body,/data-action="save-event-note"[^>]*disabled[^>]*>שומרים…/);assert.match(body,/id="event-note-error" role="alert">בעיה &lt;במידע&gt;/);
});

test('note fields and confirmation metadata escape untrusted text without truncating stored content',()=>{
 const body=render({noteId:'x" onclick="bad',titleDraft:'<script>bad</script>',bodyDraft:'<img src=x onerror=bad> & content'}).body;assert.doesNotMatch(body,/<script>|<img/);assert.match(body,/&lt;script&gt;bad/);assert.match(body,/&lt;img src=x onerror=bad&gt; &amp; content/);assert.match(body,/data-note-id="x&quot; onclick=&quot;bad"/);
 const confirm=renderEventNoteDeleteConfirmationView({noteTitle:'<script>bad</script>',processing:true});assert.match(confirm,/role="alertdialog"/);assert.match(confirm,/id="event-note-delete-name">&lt;script&gt;bad/);assert.match(confirm,/data-action="confirm-important-action" disabled/);assert.match(confirm,/הפתק יימחק לכל משתתפי האירוע/);assert.doesNotMatch(confirm,/important-action-label|<script>/);
});

const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
const source=(name)=>{const a=app.indexOf('function '+name+'(');assert.ok(a>=0);const tail=app.slice(a),end=tail.search(/\n(?:async )?function /);assert.ok(end>0);return tail.slice(0,end)};

test('editor adapter derives original guards and field limits, leaving UI free of persistence decisions',()=>{
 const note=Object.freeze({id:'n',title:'stored',body:'full stored body',pinned:true}),event=Object.freeze({id:'e',name:'event',locked:true,notes:Object.freeze([note])});let captured;
 runInNewContext(source('renderEventNoteDialog','renderEventShareMenu')+'\nrenderEventNoteDialog(event)',{event,eventDialog:{noteId:'n',titleDraft:'draft',bodyDraft:'draft body',pinned:false,error:'denied',saving:true},canCurrentParticipantEdit:()=>false,pendingEventNoteDeletionMatches:()=>({note}),MAX_EVENT_NOTE_TITLE_LENGTH:180,MAX_EVENT_NOTE_BODY_LENGTH:12000,renderEventNoteEditorView:(m,c)=>(captured={m,c},'view'),renderEventDialogShell:()=>{throw Error('view must own shell composition')}});
 assert.equal(captured.m.canEdit,false);assert.equal(captured.m.pendingDeletion,true);assert.equal(captured.m.locked,true);assert.equal(captured.m.isNew,false);assert.equal(captured.m.noteId,'n');assert.equal(captured.m.titleDraft,'draft');assert.equal(captured.m.bodyDraft,'draft body');assert.equal(captured.m.storedPinned,true);assert.equal(captured.m.pinned,false);assert.equal(captured.m.maxTitleLength,180);assert.equal(captured.m.maxBodyLength,12000);assert.equal(captured.m.saving,true);
});

test('confirmation request adds display title while preserving pending-note fallback, payload and trigger',()=>{
 const note=Object.freeze({id:'n',title:'פרטי הלינה'}),event=Object.freeze({id:'e',notes:Object.freeze([])}),trigger=Object.freeze({id:'original-delete'});let captured;
 runInNewContext(source('requestEventNoteDeletion','deleteEventNote')+'\nrequestEventNoteDeletion("e","n",trigger)',{trigger,eventDialog:{titleDraft:note.title},getEvent:()=>event,pendingEventNoteDeletionMatches:()=>({note}),canCurrentParticipantEdit:()=>true,openImportantActionDialog:(m,t)=>captured={m,t},showNotice:()=>{throw Error('valid request should not be rejected')}});
 assert.equal(captured.m.kind,'delete-event-note');assert.equal(captured.m.noteTitle,note.title);assert.deepEqual(JSON.parse(JSON.stringify(captured.m.payload)),{eventId:'e',noteId:'n'});assert.equal(captured.t,trigger);
});
