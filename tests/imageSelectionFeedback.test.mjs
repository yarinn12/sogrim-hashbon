import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {imageFeedbackMessage,renderImageSelectionFeedback,IMAGE_OPEN_ERROR_MESSAGE,IMAGE_COVER_PERMISSION_MESSAGE} from '../src/ui/imageSelectionFeedback.mjs';
import {renderProfileAvatarPickerView} from '../src/ui/profileAvatarPresentation.mjs';
import {renderEventSettingsOverviewView} from '../src/ui/eventSettingsOverviewPresentation.mjs';
const app=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
function fn(name){const start=app.indexOf(`function ${name}(`),async=app.slice(start-6,start)==='async '?start-6:start;assert(start>=0);const next=/\n(?:async )?function /.exec(app.slice(start+1));return app.slice(async,next?start+1+next.index:undefined)}

test('image feedback is escaped and absent for an empty message',()=>{assert.equal(renderImageSelectionFeedback(''),'');const h=renderImageSelectionFeedback('<img src=x> & "');assert.match(h,/role="alert"/);assert.match(h,/&lt;img src=x&gt; &amp; &quot;/);assert.doesNotMatch(h,/<img/)});
test('image feedback requires the same account generation, screen, dialog and event',()=>{const surface={scope:'account:g1',screen:{},dialog:{},eventId:'event-a'},f={...surface,message:'failed'};assert.equal(imageFeedbackMessage(f,surface),'failed');for(const changed of[{scope:'account:g2'},{screen:{}},{dialog:{}},{eventId:'event-b'}])assert.equal(imageFeedbackMessage(f,{...surface,...changed}),'');assert.equal(imageFeedbackMessage(null,surface),'')});
test('profile image failure is inside its open image selection without changing gallery/camera contracts',()=>{const h=renderProfileAvatarPickerView({editing:true,imageFeedback:IMAGE_OPEN_ERROR_MESSAGE});assert.match(h,/avatar-selection-review" open/);assert.ok(h.indexOf('image-selection-feedback')>h.indexOf('profile-avatar-picker-body'));assert.ok(h.indexOf('image-selection-feedback')<h.indexOf('profile-avatar-source-grid'));assert.match(h,/data-image-source="gallery"/);assert.match(h,/capture="environment"/);assert.doesNotMatch(h,/profile-name-error/)});
test('first-run preset selection never adds profile editor/upload controls',()=>{const h=renderProfileAvatarPickerView({imageFeedback:'unrelated'});assert.doesNotMatch(h,/image-selection-feedback|type="file"|profile-avatar-picker-shell/)});
test('settings shows image feedback directly before original source controls and preserves readonly guards',()=>{const m={eventId:'event',eventName:'test',canManage:false,imageFeedback:IMAGE_COVER_PERMISSION_MESSAGE};const r=renderEventSettingsOverviewView(m,{renderEventDialogShell:x=>x,renderEventSettingsMenuItem:()=>''});assert.ok(r.body.indexOf('image-selection-feedback')<r.body.indexOf('event-cover-settings-actions'));assert.equal((r.body.match(/hidden disabled/g)||[]).length,2);assert.match(r.body,/capture="environment"/);assert.doesNotMatch(r.body,/remove-event-cover/)});

function harness({mutation=false}={}){
 let resolve,reject;const gate=new Promise((yes,no)=>{resolve=yes;reject=no}),writes=[];
 const c={owner:'account:g1',screen:{name:'event',eventId:'event'},eventDialog:{kind:'settings',eventId:'event'},eventCoverImageRequest:null,eventCoverFeedback:null,profileAvatarRequest:null,profileAvatarFeedback:null,profileAvatarRevision:0,profileAvatarPendingPreview:'',profileAvatarImageDraft:'old',profileError:'name validation',notice:'',renders:0,
  getEvent:()=>({id:'event'}),canCurrentParticipantManage:()=>true,profileSaveOwnerScope:()=>c.owner,requestImageCrop:()=>gate,
  encodeCanvasJpegWithinLimit:()=> 'image',compressProfileAvatarImage:()=> 'image',updateEventCoverImage:async(...args)=>writes.push(args),finishProfileAvatarSave:async()=>writes.push('profile'),render:()=>c.renders++,console:{warn(){}},IMAGE_OPEN_ERROR_MESSAGE,imageFeedbackMessage};
 runInNewContext(fn('imageFeedbackSurface')+';'+fn('showEventCoverImageFailure'),c);
 let source=fn('saveEventCoverImage');if(mutation)source=source.replaceAll('if (!isCurrent()) return;','');
 runInNewContext(source+';'+fn('saveProfileAvatarImage'),c);
 return{c,writes,resolve,reject};
}
for(const change of ['owner','screen','dialog'])test('late event crop success cannot save after changing '+change,async()=>{
 for(const mutation of[true,false]){const h=harness({mutation}),p=h.c.saveEventCoverImage('event',{type:'image/png'});h.c[change==='dialog'?'eventDialog':change]=change==='owner'?'account:g2':{};h.resolve('canvas');await p;assert.equal(h.writes.length,mutation?1:0,'controlled removal of UI-intent guard must reproduce stale save');}
});
test('late event image decoding failure cannot render on a replacement surface',async()=>{for(const mutation of[true,false]){const h=harness({mutation}),p=h.c.saveEventCoverImage('event',{type:'image/png'});h.c.screen={name:'home'};h.reject(Error('unreadable'));await p;assert.equal(h.c.renders,mutation?1:0);assert.equal(h.c.notice,'');assert.equal(h.c.eventCoverFeedback,null)}});
test('an older failed image selection cannot overwrite a newer attempt',async()=>{const h=harness(),p=h.c.saveEventCoverImage('event',{type:'image/png'});h.c.eventCoverImageRequest={newer:true};h.reject(Error('unreadable'));await p;assert.equal(h.c.renders,0);assert.equal(h.c.eventCoverFeedback,null);assert.deepEqual(h.c.eventCoverImageRequest,{newer:true})});
test('profile image failure leaves name validation independent and scopes feedback to the image',async()=>{const h=harness(),p=h.c.saveProfileAvatarImage({type:'image/png'});h.reject(Error('unreadable'));await p;assert.equal(h.c.profileError,'name validation');assert.equal(h.c.profileAvatarFeedback.message,IMAGE_OPEN_ERROR_MESSAGE);assert.equal(h.c.profileAvatarRequest,null)});
test('invalid image file type shows scoped feedback without opening crop or retaining a request',async()=>{for(const profile of[true,false]){const h=harness();await(profile?h.c.saveProfileAvatarImage({type:'text/plain'}):h.c.saveEventCoverImage('event',{type:'text/plain'}));assert.equal(h.writes.length,0);assert.match((profile?h.c.profileAvatarFeedback:h.c.eventCoverFeedback).message,/תמונה בלבד/);assert.equal(profile?h.c.profileAvatarRequest:h.c.eventCoverImageRequest,null)}});
test('event main view retains global failure while settings alone receives contextual feedback',()=>{const h=harness();h.c.eventDialog=null;const s=h.c.imageFeedbackSurface('event');h.c.showEventCoverImageFailure('event','inline',s,'original failure');assert.equal(h.c.notice,'original failure');assert.equal(h.c.eventCoverFeedback,null);h.c.eventDialog={kind:'settings',eventId:'event'};h.c.showEventCoverImageFailure('event','inline',h.c.imageFeedbackSurface('event'),'fallback');assert.equal(h.c.notice,'');assert.equal(h.c.eventCoverFeedback.message,'inline')});
test('a delayed receipt never clears a newer surface message',()=>{const h=harness(),s=h.c.imageFeedbackSurface('event');h.c.owner='account:g2';h.c.eventCoverFeedback={message:'new error'};h.c.notice='new notice';h.c.showEventCoverImageFailure('event','old',s,'old fallback');assert.equal(h.c.notice,'new notice');assert.equal(h.c.eventCoverFeedback.message,'new error')});

test('Escape belongs to the top crop dialog instead of navigating underlying settings',()=>{
 const guard="if (event.target.closest?.('.image-crop-dialog[open]')) return;";
 assert.ok(fn('handleDialogKeydown').includes(guard));
 for(const mutation of[true,false]){
  let back=0,prevented=0;const c={event:{key:'Escape',target:{closest:s=>s==='.image-crop-dialog[open]'?{}:null},preventDefault:()=>prevented++},expenseDatePickerOwnsEscape:()=>false,handleRadioGroupKeyboardNavigation:()=>false,handleFriendsHubTabKeyboardNavigation:()=>false,handleInputKeyboardShortcut:()=>false,handleEventSettingsPhotoKeydown:()=>false,closeOpenTransientMenus:()=>false,settlementCloseConfirmation:null,app:{querySelector:()=>({})},goBackInApp:()=>back++};
  const s=mutation?fn('handleDialogKeydown').replace(guard,''):fn('handleDialogKeydown');
  runInNewContext(s+';handleDialogKeydown(event)',c);assert.equal(back,mutation?1:0);assert.equal(prevented,mutation?1:0);
 }
});
