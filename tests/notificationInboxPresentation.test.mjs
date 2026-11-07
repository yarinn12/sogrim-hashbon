import {iconSvg} from "../src/uiIcons.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderNotificationInboxView} from '../src/ui/notificationInboxPresentation.mjs';
const item={id:'notice-1',eventId:'event-1',kind:'expense-created',title:'הוצאה חדשה',body:'דנה הוסיפה הוצאה',createdAt:'2026-10-28T10:00:00Z',timeLabel:'לפני שעה',readAt:'',view:'event'};
test('notification view keeps real buttons inside list items and stable bulk action',()=>{
 const html=renderNotificationInboxView({items:[item],available:true,unread:1});
 assert.match(html,/notification-inbox-list-entry" role="listitem"><button/);assert.doesNotMatch(html,/<button[^>]*role="listitem"/);
 for(const attr of ['data-notification-id="notice-1"','data-event-id="event-1"','data-notification-view="event"','role="img" aria-label="לא נקרא"'])assert.ok(html.includes(attr),attr);
 assert.ok(html.indexOf('</small>')<html.indexOf('<time'));
 const read=renderNotificationInboxView({items:[{...item,readAt:'now'}],available:true});assert.match(read,/data-action="mark-all-notifications-read" disabled/);assert.doesNotMatch(read,/notification-unread-dot/);
});
test('notification view distinguishes empty, failure, pending and loading',()=>{
 assert.match(renderNotificationInboxView({available:true}),/אין התראות כרגע/);assert.match(renderNotificationInboxView({error:'load-failed'}),/data-action="retry-notifications"/);
 assert.match(renderNotificationInboxView(),/ההתראות מחכות בחשבון שלך/);assert.match(renderNotificationInboxView({status:'loading',loadingHtml:'<div data-loading></div>'}),/data-loading/);
});
test('notification view escapes content and attributes and preserves destinations',()=>{
 const html=renderNotificationInboxView({available:true,items:[{...item,id:'"><script>x</script>',title:'<img onerror=x>',body:'<script>x</script>',timeLabel:'<b>x</b>',view:'summary'}]});
 assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/data-notification-view="summary"/);
});
test('friend request copy is neutral',()=>{
 const html=renderNotificationInboxView({available:true,items:[{...item,kind:'friend-request',title:'דנה לוי שלח לך בקשת חברות',view:'friends'}]});assert.match(html,/בקשת חברות מדנה לוי/);assert.match(html,/data-notification-view="friends"/);
});
test('notification presentation is offline in both worker inventories and adapted without data imports',()=>{
 const view=readFileSync('src/ui/notificationInboxPresentation.mjs','utf8'),sw=readFileSync('sw.js','utf8'),app=readFileSync('src/app.mjs','utf8');
 assert.equal(sw.split('"/src/ui/notificationInboxPresentation.mjs"').length-1,2);assert.doesNotMatch(view,/from ["'].*(?:data|domain|server)\//);assert.match(app,/return renderNotificationInboxView\(/);assert.match(app,/timeLabel: formatNotificationTime\(item.createdAt\)/);
});

test('payment reminders retain a reminder icon rather than indicating completion',()=>{const html=renderNotificationInboxView({available:true,items:[{...item,kind:'payment-reminder'}]});assert.ok(html.includes(iconSvg('bell')));assert.ok(!html.includes(iconSvg('check')));});
