import test from 'node:test';
import assert from 'node:assert/strict';
import {renderExpenseParticipantAddRouteView as route,renderExpenseParticipantAddMenuView as menu,renderExpenseParticipantFriendListView as friends,renderExpenseParticipantOfflineFormView as manual} from '../src/ui/expenseParticipantAddPresentation.mjs';

test('expense add choices retain their original action order and event identity',()=>{
 const html=menu({eventId:'event-1',hasFriends:true,canEdit:true,friendDescription:'בחר משתמש שכבר מחובר אליך'});
 assert.ok(html.indexOf('data-view="friends"')<html.indexOf('data-action="expense-share-invite"'));
 assert.ok(html.indexOf('data-action="expense-share-invite"')<html.indexOf('data-view="offline"'));
 assert.match(html,/data-event-id="event-1"/);assert.doesNotMatch(html,/disabled/);
 assert.match(html,/שלח קישור לאירוע/);assert.match(html,/הוספה לפי שם/);
});
test('absence of friends disables only the friend choice and explains why',()=>{
 const html=menu({eventId:'e',canEdit:true,friendDescription:'עדיין אין לך חברים באפליקציה'});
 assert.equal((html.match(/\bdisabled/g)||[]).length,1);assert.match(html,/עדיין אין לך חברים באפליקציה/);
});
test('readonly route and all descendant choices retain their permission barriers',()=>{
 assert.equal((menu({hasFriends:true}).match(/\bdisabled/g)||[]).length,3);
 assert.match(route({blockedMessage:'אין הרשאה'}),/<fieldset class="expense-flow-fields" disabled>/);
 assert.match(friends({friends:[{id:'p',name:'אדם'}]}),/data-participant-id="p"\s+disabled/);
 assert.equal((manual().match(/\bdisabled/g)||[]).length,2);
});
test('untrusted names, status, event and participant ids are escaped while trusted avatar slots survive',()=>{
 const value='"<img src=x onerror=bad>&';
 const html=friends({eventId:value,canEdit:true,friends:[{id:value,name:value,avatarHtml:'<span class="avatar"></span>',usernameHtml:'<small>demo</small>'}]});
 assert.doesNotMatch(html,/<img/);assert.match(html,/&quot;&lt;img/);assert.match(html,/<span class="avatar">/);
 const shell=route({eventId:value,invitationMessage:value,blockedMessage:value});assert.doesNotMatch(shell,/<img/);
 assert.doesNotMatch(friends({friendDescription:value}),/<img/);
});
test('manual entry has one explanation, stable input/action hooks and a visible name label',()=>{
 const html=manual({eventId:'e',canEdit:true});
 assert.equal((html.match(/מוסיפים אדם/g)||[]).length,1);
 assert.match(html,/שם המשתתף/);assert.match(html,/name="expenseGuestName"/);assert.match(html,/placeholder="שם מלא"/);
 assert.match(html,/data-action="event-add-guest" data-event-id="e"/);assert.doesNotMatch(html,/disabled/);
});
test('route keeps accessible labels, sync statuses, progress and foreground navigation slots',()=>{
 for(const [view,title]of[['menu','הוספת משתתף'],['friends','בחר מחברים'],['offline','הוספה לפי שם']]){
  const html=route({eventId:'e',view,canEdit:true,progressHtml:'<ol id="progress"></ol>',bodyHtml:'<main id="content"></main>',navHtml:'<nav id="nav"></nav>'});
  assert.ok(html.includes(title));assert.match(html,/aria-labelledby="expense-participant-add-title"/);
  assert.match(html,/data-inline-sync-status data-sync-event-id="e"/);
  for(const id of ['progress','content','nav'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(html,/data-action="expense-participant-add-back"/);
 }
});
