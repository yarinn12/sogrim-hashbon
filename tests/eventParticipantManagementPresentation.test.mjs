import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as ui from '../src/ui/eventParticipantManagementPresentation.mjs';
const source=await readFile('src/app.mjs','utf8');
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const functions=['renderEventParticipantsDialog','renderConnectedEventParticipantProfile','renderOfflineEventParticipantProfile','renderEventParticipantLinkDialog','renderEventParticipantRemovalRow','renderEventParticipantAdminControl'];
function harness({canEdit=true,canManage=true,kind='accepted',candidates=true,lastAdmin=false}={}){
 const owner={id:'owner',displayName:'Owner'},account={id:'account',displayName:'Dana <script>'},offline={id:'offline',displayName:'Yael <img>'};
 const state={currentParticipantId:'owner',participants:[owner,account,offline]};const before=JSON.stringify(state);
 const context={...ui,state,eventDialog:{participantId:'offline'},EVENT_SPACE_ID_FIELD:'sharedSpaceId',friendNetworkBusyAction:'',
  canCurrentParticipantEdit:()=>canEdit,canCurrentParticipantManage:()=>canManage,canCurrentParticipantChangeEventMembership:()=>canManage,
  activeEventParticipants:()=>state.participants,eventParticipants:()=>state.participants,isEventParticipantInactive:()=>false,isEventClosed:()=>false,
  eventAdminIds:()=>lastAdmin?['account']:['owner'],compareEventParticipantRoster:()=>0,
  renderEventDialogShell:model=>model,renderEventIdentityNotice:()=>'',renderCurrentEventParticipants:()=>'<roster>',renderInactiveEventParticipants:()=>'',
  participantName:id=>state.participants.find(p=>p.id===id)?.displayName,accountUserIdFromParticipantId:id=>id,
  participantConnectionStatus:p=>({connected:p.id!=='offline'}),eventParticipantFriendshipState:()=>({kind}),
  linkableEventAccountParticipants:()=>candidates?[account]:[],renderAvatar:id=>`<avatar data-id="${id}"></avatar>`,
  renderParticipantUsername:()=>'<small class="participant-username">dana</small>',renderParticipantConnectionBadge:()=>'<small class="participant-identity-label">שם אופליין</small>',
  renderRelationshipFriendshipControl:({friendship})=>`<control data-kind="${friendship.kind}"></control>`,
  commandIconSvgs:{participants:'<svg/>',profile:'<svg/>',edit:'<svg/>',link:'<svg/>'},iconSvg:()=>'<svg/>',renderCommandIcon:()=>'<svg/>',escapeHtml:escape,escapeAttribute:escape};
 vm.createContext(context);
 for(const name of functions){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+10);assert.ok(a>=0&&b>a,name);vm.runInContext(source.slice(a,b),context)}
 const event={id:'event',name:'Weekend',participantIds:['owner','account','offline'],sharedSpaceId:'space'};
 return{context,event,account,offline,unchanged:()=>assert.equal(JSON.stringify(state),before)};
}
test('participant detail copy distinguishes a name from account access without decorative identity badges',()=>{
 assert.equal(ui.participantDetailTitle,'פרטי משתתף');const html=ui.renderOfflineParticipantExplanationView();
 assert.match(html,/שם שנוסף לחלוקת ההוצאות/);assert.match(html,/אין גישה לאירוע/);assert.doesNotMatch(html,/badge|eyebrow|button/);
});
test('accepted friendship has no repeated promotional explanation; unavailable shared event keeps its actionable message',()=>{
 assert.equal(ui.renderParticipantFriendshipHintView({kind:'accepted',awaitingSharedEvent:true}),'');
 assert.match(ui.renderParticipantFriendshipHintView({kind:'available',awaitingSharedEvent:true}),/יסיים להסתנכרן/);
 assert.match(ui.renderParticipantFriendshipHintView({kind:'incoming'}),/אחרי האירוע/);
});
test('count text is escaped without creating markup or extra instructions',()=>{
 assert.equal(ui.renderParticipantCountView('4 משתתפים'),'4 משתתפים');assert.equal(ui.renderParticipantCountView('<img src=x>'),'&lt;img src=x&gt;');
 assert.doesNotMatch(ui.renderParticipantAccountListLabelView(),/button|badge/);assert.match(ui.renderParticipantAccountLinkIntroView(),/אותו אדם/);
});
test('actual roster adapter retains route/back identity, read-only add state and all roster rendering',()=>{
 const x=harness({canEdit:false}),v=x.context.renderEventParticipantsDialog(x.event);
 assert.equal(v.title,'מי באירוע');assert.equal(v.routeMode,true);assert.equal(v.backAction,'event-participants-back');assert.match(v.modalClass,/event-participant-presentation-screen/);
 assert.match(v.body,/<roster>/);assert.match(v.body,/data-action="open-event-participant-add"[\s\S]*disabled/);x.unchanged();
});
for(const kind of['accepted','incoming','blocked'])test('actual account detail keeps '+kind+' relationship and management actions',()=>{
 const x=harness({kind}),v=x.context.renderConnectedEventParticipantProfile(x.event,x.account);
 assert.equal(v.title,'פרטי משתתף');assert.equal(v.eyebrow,'');assert.equal(v.backLabel,'חזרה למשתתפים');
 assert.match(v.body,/Dana &lt;script&gt;/);assert.match(v.body,new RegExp('data-kind="'+kind+'"'));assert.match(v.body,/data-action="toggle-event-participant-admin"/);assert.match(v.body,/data-action="remove-event-participant"/);assert.doesNotMatch(v.body,/<script>/);x.unchanged();
});
test('last remaining admin cannot be disabled by the unchanged adapter predicate',()=>{
 const x=harness({lastAdmin:true}),html=x.context.renderEventParticipantAdminControl(x.event,x.account);assert.match(html,/checked[\s\S]*disabled/);assert.match(html,/חייב להישאר לפחות מנהל אחד/);x.unchanged();
});
for(const canManage of[true,false])test('offline detail retains edit/link/removal permissions '+canManage,()=>{
 const x=harness({canManage,canEdit:canManage}),v=x.context.renderOfflineEventParticipantProfile(x.event,x.offline);
 assert.equal(v.title,'פרטי משתתף');assert.match(v.body,/אין גישה לאירוע/);assert.match(v.body,/data-action="open-offline-participant-rename"/);assert.match(v.body,/data-action="open-event-participant-link"/);
 assert.equal(v.body.includes('data-action="remove-event-participant"'),canManage);if(!canManage)assert.equal((v.body.match(/\sdisabled/g)||[]).length,2);x.unchanged();
});
for(const candidates of[true,false])test('account picker retains exact source/target identity and invitation availability '+candidates,()=>{
 const x=harness({candidates}),v=x.context.renderEventParticipantLinkDialog(x.event);
 assert.equal(v.title,'קישור לחשבון');assert.match(v.body,/data-action="open-event-participant-link-invite"/);
 assert.equal(v.body.includes('data-action="link-offline-participant-account"'),candidates);
 if(candidates){assert.match(v.body,/data-source-participant-id="offline"/);assert.match(v.body,/data-target-participant-id="account"/);assert.match(v.body,/Dana &lt;script&gt;/);assert.match(v.body,/חשבונות באירוע/)}
 assert.doesNotMatch(v.body,/משתמש בסוגרים חשבון|איזה חשבון שייך לאדם הזה/);x.unchanged();
});
