import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import vm from "node:vm";
import {renderExistingEventManualParticipantEditorView} from "../src/ui/eventManualParticipantEditor.mjs";
import {iconSvg} from "../src/uiIcons.mjs";
const source=readFileSync(process.env.EVENT_FRIENDS_TEST_APP||"src/app.mjs","utf8"),viewPath=new URL("../src/ui/eventFriendsPicker.mjs",import.meta.url),view=existsSync(viewPath)?await import(viewPath):null;
function fn(name){const start=source.indexOf("function "+name+"("),next=source.slice(start+1).search(/\r?\n(?:async )?function /);assert.ok(start>=0,name);return source.slice(start,next<0?source.length:start+1+next)}
function harness({empty=false,hasSaved=true,canEdit=true,pending="friend",addInProgress=false,mode="friends"}={}){
 const owner=Object.freeze({id:"owner",displayName:"אני",connected:true}),friend=Object.freeze({id:"friend",displayName:"איתי כהן",connected:true}),offline=Object.freeze({id:"offline",displayName:"יעל ישראלי",connected:false});
 const state={currentParticipantId:"owner",participants:Object.freeze([owner,friend,offline])},event=Object.freeze({id:"event-123",name:"סוף השבוע",participantIds:Object.freeze(empty?["owner","friend","offline"]:["owner"])}),avatars=[],filters=[];
 const escape=value=>String(value??"").replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const context=vm.createContext({state,eventDialog:{pendingParticipantId:pending,addInProgress,contactNameDraft:"שם בדיקה"},
  participantCandidateFilter:(ids,action)=>{filters.push({ids:Array.from(ids),action});return p=>p.id==='owner'||hasSaved},
  participantConnectionStatus:p=>({connected:p.connected}),participantName:id=>state.participants.find(p=>p.id===id)?.displayName||id,
  participantSearchIdentity:(p,n)=>n,escapeHtml:escape,escapeAttribute:escape,iconSvg,
  renderAvatar:(id,event,options)=>{avatars.push({id,eventId:event.id,options});return options?.suppressParticipantAction?'<span class="avatar" aria-hidden="true"></span>':'<span class="avatar" data-action="open-participant-statistics" role="button"></span>'},
  renderParticipantUsername:p=>p.connected?'<bdi class="participant-username">itay_cohen</bdi>':'',renderParticipantMembershipStatus:()=>'',
  renderExistingEventManualParticipantEditorView,renderEventFriendsPickerView:view?.renderEventFriendsPickerView
 });
 vm.runInContext(fn('renderAvailableEventParticipantGroup')+'\n'+fn('renderAvailableEventParticipantRow')+'\n'+fn('renderEventParticipantAddEditor'),context);
 const html=context.renderEventParticipantAddEditor(event,empty?[]:Object.freeze([friend,offline]),canEdit,mode);
 return {html,avatars,filters,event};
}

test("no saved friends gets the approved empty explanation and Friends destination",()=>{
 const h=harness({empty:true,hasSaved:false});assert.match(h.html,/>עוד אין חברים</);assert.match(h.html,/data-action="open-friends-from-event-add"/);assert.doesNotMatch(h.html,/כל החברים כבר באירוע/);
});
test("all saved people already included gets invitation choices instead of an incorrect no-friends message",()=>{
 const h=harness({empty:true});assert.match(h.html,/>כל החברים כבר באירוע</);assert.match(h.html,/data-action="event-participant-add-view-back"/);assert.doesNotMatch(h.html,/open-friends-from-event-add|עוד אין חברים/);assert.deepEqual(h.filters,[{ids:[],action:"event-participant"}]);
});
test("picker avatars use the existing non-navigating renderer and each row is one selection action",()=>{
 const h=harness();assert.equal(h.avatars.length,2);for(const a of h.avatars)assert.equal(a.options?.suppressParticipantAction,true);assert.doesNotMatch(h.html,/open-participant-statistics|role="button"/);assert.equal((h.html.match(/data-action="select-event-participant-candidate"/g)||[]).length,2);assert.equal((h.html.match(/class="event-participant-candidate-row event-friend-choice-row/g)||[]).length,2);
});
test("selected, progress and read-only states retain event scope and confirmation gating",()=>{
 for(const [pending,canEdit,progress,disabled]of [['friend',true,false,false],['ghost',true,false,true],['friend',false,false,true],['friend',true,true,true]]){
  const h=harness({pending,canEdit,addInProgress:progress}),button=h.html.match(/<button[^>]*data-action="confirm-event-participant-add"[^>]*>/)?.[0];assert.ok(button);assert.match(button,/data-event-id="event-123"/);assert.equal(/\bdisabled\b/.test(button),disabled);assert.equal(/aria-busy="true"/.test(button),progress);assert.equal((h.html.match(/aria-pressed="true"/g)||[]).length,pending==='friend'?1:0);
 }
});
test("the manual editor remains on its original input and add action",()=>{
 const h=harness({mode:'manual',canEdit:false});assert.match(h.html,/data-action="event-guest-name"/);assert.match(h.html,/data-action="event-add-guest"/);assert.doesNotMatch(h.html,/event-friend-choice-row/);
});
test("picker presentation separates groups without repeating the page heading",()=>{
 const h=harness();assert.match(h.html,/חברים באפליקציה/);assert.match(h.html,/שמות ידניים/);assert.match(h.html,/אנשים ללא חשבון באפליקציה/);assert.doesNotMatch(h.html,/<h2>בחר מחברים|חשבונות שאפשר להוסיף ישירות|ייבחר להוספה רק/);
});
test("pure picker escapes display names and action attributes and ignores a stale selection",()=>{
 assert.ok(view?.renderEventFriendsPickerView);const html=view.renderEventFriendsPickerView({eventId:'"><img onerror=x>',connected:[{id:'id"bad',displayName:'<script>x</script>',avatarHtml:'<span class="avatar"></span>',usernameHtml:''}],selectedParticipantId:'missing',canEdit:true});assert.doesNotMatch(html,/<script|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;/);assert.match(html,/<button[^>]*data-action="confirm-event-participant-add"[^>]*disabled/);
});
test("pure picker has no persistence dependencies and ships in both offline inventories",()=>{
 assert.ok(view?.renderEventFriendsPickerView);const ui=readFileSync(viewPath,'utf8'),sw=readFileSync('sw.js','utf8');assert.doesNotMatch(ui,/localStorage|sessionStorage|fetch\(|from ["'].*(?:data|domain|server)\//);assert.equal(sw.split('"/src/ui/eventFriendsPicker.mjs"').length-1,2);
});
