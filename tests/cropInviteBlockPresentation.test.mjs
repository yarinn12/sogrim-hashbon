import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{runInNewContext}from'node:vm';
import{renderImageCropView,imageCropPresentationStyles}from'../src/ui/imageCropPresentation.mjs';
import{renderFriendInvitationView}from'../src/ui/friendInvitationPresentation.mjs';
import{renderBlockedUsersView,captureBlockedUsersDisclosure,restoreBlockedUsersDisclosure}from'../src/ui/blockedUsersPresentation.mjs';
import{transform}from'lightningcss';

test('profile crop has one escaped instruction and real original crop controls',()=>{
 const html=renderImageCropView({shape:'circle',title:'<img src=x>',description:'הזז <script>'});
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<script|<img src=x>|image-crop-hint/);
 for(const action of['confirm','reset','cancel'])assert.ok(html.includes('data-crop-action="'+action+'"'));
 assert.match(html,/type="range" min="1" max="3" step="0.01"/);assert.match(html,/data-crop-preview/);assert.match(html,/חזרה לבחירת תמונה/);assert.match(html,/<svg/);
});
test('rectangle crop retains its existing frame instruction and close control',()=>{const html=renderImageCropView({shape:'rectangle',title:'תמונת האירוע',description:'הזז'});assert.match(html,/is-rectangle/);assert.match(html,/מה שנמצא בתוך המלבן/);assert.match(html,/סגירת בחירת התמונה/)});
test('scalable crop styling compiles and preserves circle/rectangle crop geometry',()=>{const result=transform({filename:'crop.css',code:Buffer.from(imageCropPresentationStyles),minify:true});assert.ok(result.code.length);assert.match(imageCropPresentationStyles,/\.image-crop-stage\.is-circle[^}]*border-radius: 50%/);assert.match(imageCropPresentationStyles,/\.image-crop-stage\.is-rectangle[^}]*aspect-ratio: var\(--image-crop-aspect/);assert.match(imageCropPresentationStyles,/\[data-crop-shape="circle"\] \.image-crop-title[^}]*font-size:1.125rem/);assert.match(imageCropPresentationStyles,/\[data-crop-shape="circle"\] \.image-crop-zoom[^}]*font-size:.9375rem/)});
test('loading invitation exposes live status and exit without a duplicate disabled CTA',()=>{const html=renderFriendInvitationView({status:'loading'});assert.match(html,/role="status"/);assert.match(html,/בודקים את קישור החברות/);assert.match(html,/friend-invite-dismiss/);assert.doesNotMatch(html,/data-action="friend-invite-retry"|friend-invite-confirm/)});
for(const status of['error','unavailable'])test(`invitation ${status} keeps the existing safe recovery without an unverified person`,()=>{const html=renderFriendInvitationView({status,profile:{display_name:'UNVERIFIED'}});assert.doesNotMatch(html,/UNVERIFIED|friend-invite-confirm/);assert.match(html,status==='error'?/friend-invite-retry/:/friend-invite-return/)});
const users=[{targetUserId:'a',displayName:'דנה <לוי>',username:'dana_levi'},{targetUserId:'b',displayName:'אלכסנדרה ישראלי כהן',username:'alexandra_israeli_cohen'}];
test('blocked list is one disclosure, escapes server labels and scopes error to exact target',()=>{
 const html=renderBlockedUsersView({users,ownerScope:'"scope"',feedback:{targetUserId:'b',message:'<failed>'}});
 assert.equal((html.match(/class="blocked-users-list"/g)||[]).length,1);assert.equal((html.match(/role="alert"/g)||[]).length,1);assert.match(html,/דנה &lt;לוי&gt;/);assert.match(html,/data-owner-scope="&quot;scope&quot;"/);assert.match(html,/data-blocked-user-id="b"[\s\S]*נסה שוב[\s\S]*&lt;failed&gt;/);assert.doesNotMatch(html.slice(html.indexOf('data-blocked-user-id="a"'),html.indexOf('data-blocked-user-id="b"')),/נסה שוב|role="alert"/);
});
test('unrelated/missing blocked targets never render stale feedback and empty lists stay absent',()=>{assert.equal(renderBlockedUsersView(), '');const html=renderBlockedUsersView({users,feedback:{targetUserId:'unknown',message:'STALE'}});assert.doesNotMatch(html,/STALE|נסה שוב|role="alert"/)});
test('pending blocked-list actions stay disabled without changing identities or action payloads',()=>{const html=renderBlockedUsersView({users,busy:true});assert.equal((html.match(/ disabled/g)||[]).length,2);assert.match(html,/data-target-user-id="a"/);assert.match(html,/data-target-user-id="b"/);assert.doesNotMatch(html,/unblock-confirm|request-friend/)});
test('disclosure survives only the same account generation and screen',()=>{
 const screen={},panel={open:true,dataset:{ownerScope:'account:1'}},root={querySelector:()=>panel},snapshot=captureBlockedUsersDisclosure(root,screen);panel.open=false;
 assert.equal(restoreBlockedUsersDisclosure(root,snapshot,'account:1',screen),true);assert.equal(panel.open,true);
 for(const[scope,surface]of[['account:2',screen],['account:1',{}]]){panel.open=false;assert.equal(restoreBlockedUsersDisclosure(root,snapshot,scope,surface),false);assert.equal(panel.open,false)}
 panel.dataset.ownerScope='replacement';assert.equal(restoreBlockedUsersDisclosure(root,snapshot,'account:1',screen),false);assert.equal(restoreBlockedUsersDisclosure(root,{...snapshot,open:false},'account:1',screen),false);
});
test('absent blocked disclosure never creates new DOM or restores another panel',()=>{const root={querySelector:()=>null};assert.equal(captureBlockedUsersDisclosure(root,{}),null);assert.equal(restoreBlockedUsersDisclosure(root,{open:true,scope:'x',screen:null},'x',null),false)});

const app=await readFile('src/app.mjs','utf8');
const unblockSource=app.slice(app.indexOf('async function performConnectedUserUnblock('),app.indexOf('function reportSubmissionErrorMessage('));
function adapter({fails=true,eventId='',current=true,sameScreen=true}={}){
 const origin={},screen=sameScreen?origin:{},request={scope:'actor-generation',isCurrent:()=>current},log=[];
 const context={target:'b',eventId,screen,eventDialog:null,blockedUsersFeedback:{old:true},friendNetwork:{blockedUsers:[{blocked_user_id:'a'},{blocked_user_id:'b'}]},notice:'',beginFriendNetworkAction:key=>(log.push(['begin',key]),request),loadFriendActionConfig:async()=>({synthetic:true}),unblockConnectedUser:async(config,target)=>{log.push(['unblock',config.synthetic,target]);if(fails)throw Error('rejected')},refreshFriendNetwork:async options=>log.push(['refresh',options.preserveNotice]),finishFriendNetworkAction:()=>log.push(['finish']),render:()=>log.push(['render']),reactivateDialogAfterRender:()=>{},userSafetyErrorMessage:(error,fallback)=>fallback};
 return{context,log,run:()=>runInNewContext(unblockSource+';performConnectedUserUnblock(target,eventId)',context)};
}
test('unblock feedback adapter preserves existing mutation and puts a failed receipt on only the attempted target',async()=>{const a=adapter();await a.run();assert.deepEqual(a.log.find(x=>x[0]==='unblock'),['unblock',true,'b']);assert.equal(a.context.blockedUsersFeedback.targetUserId,'b');assert.equal(a.context.blockedUsersFeedback.scope,'actor-generation');assert.equal(a.context.blockedUsersFeedback.screen,a.context.screen);assert.equal(a.context.notice,'');assert.match(a.context.blockedUsersFeedback.message,/לא הצלחנו לבטל/)});
test('event participant unblock retains existing dialog/global error presentation',async()=>{const a=adapter({eventId:'event'});await a.run();assert.equal(a.context.blockedUsersFeedback,null);assert.match(a.context.notice,/לא הצלחנו לבטל/)});
test('unblock acknowledged success still refreshes friend state and clears old inline failure',async()=>{const a=adapter({fails:false});await a.run();assert.equal(a.context.blockedUsersFeedback,null);assert.ok(a.log.some(x=>x[0]==='refresh'&&x[1]));assert.match(a.context.notice,/החסימה בוטלה/)});
test('late unblock failure after account generation change cannot publish feedback or notice',async()=>{const a=adapter({current:false});await a.run();assert.equal(a.context.blockedUsersFeedback,null);assert.equal(a.context.notice,'');assert.equal(a.log.filter(x=>x[0]==='render').length,1)});
test('blocked-list adapter rejects previous account/surface feedback before rendering',()=>{
 const source=app.slice(app.indexOf('function renderBlockedUsersPanel()'),app.indexOf('function renderFriendInvitation()')),screen={},dialog=null;
 const c={screen,eventDialog:dialog,blockedUsersFeedback:{scope:'old',screen,dialog,targetUserId:'b',message:'stale'},captureFriendAccountContext:()=>({scope:'current'}),friendNetwork:{blockedUsers:[{blocked_user_id:'b',blocked_display_name:'דנה',blocked_username:'dana'}]},friendNetworkBusyAction:'',formatUsername:s=>s,renderBlockedUsersView:model=>model};
 let view=runInNewContext(source+';renderBlockedUsersPanel()',c);assert.equal(view.feedback,null);assert.equal(view.users[0].targetUserId,'b');c.blockedUsersFeedback.scope='current';view=runInNewContext(source+';renderBlockedUsersPanel()',c);assert.equal(view.feedback,c.blockedUsersFeedback);c.screen={};assert.equal(runInNewContext(source+';renderBlockedUsersPanel()',c).feedback,null);
});
