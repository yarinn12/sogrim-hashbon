import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {geometry} from './helpers/eventFriendsPicker.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/eventFriendsPickerBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const record={errors:[],external:[]};evidence.set(page,record);page.on('pageerror',e=>record.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(record.external.push(r.request().url()),r.abort()));
 await page.addInitScript({content:fixture});
 for(const [env,file]of [['EVENT_FRIENDS_TEST_APP','app.mjs'],['EVENT_FRIENDS_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']])if(process.env[env])await page.route('**/src/'+file+'*',r=>r.fulfill({contentType:'text/javascript',body:readFileSync(process.env[env],'utf8')}));
});
test.afterEach(async({page})=>{
 expect(evidence.get(page).errors).toEqual([]);expect(evidence.get(page).external).toEqual([]);
 const added=evidence.get(page).addedParticipantId;
 const writes=await page.evaluate(added=>{
  const project=events=>events.map(e=>{if(added&&e.id==='friend-weekend'){const {participantIds,updatedAt,activityLog,membershipUpdatedAt,membershipUpdatedAtByParticipant,...rest}=e;return rest}return e});
  const seed=__friendInviteQa.seedFinancialEvents,memberIds=seed.find(e=>e.id==='friend-weekend').participantIds;
  const states=__friendInviteQa.snapshotWrites.map(w=>(Array.isArray(w.body)?w.body[0]:w.body).state).filter(Boolean);
  return {profile:__friendInviteQa.profileWrites.length,friends:__friendInviteQa.writes.length,reward:__friendInviteQa.rewardWrites.length,invite:__friendInviteQa.invitePreparations?.length??0,shared:__friendInviteQa.shared.length,copied:__friendInviteQa.copied.length,finance:states.filter(s=>JSON.stringify(project(s.events))!==JSON.stringify(project(seed))).length,badMembership:added?states.filter(s=>{const ids=s.events.find(e=>e.id==='friend-weekend').participantIds;return JSON.stringify(ids)!==JSON.stringify(memberIds)&&JSON.stringify(ids)!==JSON.stringify([...memberIds,added])}).length:0};
 },added);
 expect(writes).toEqual({profile:0,friends:0,reward:0,invite:0,shared:0,copied:0,finance:0,badMembership:0});
});
async function open(page,root=16,query=''){
 await page.goto('/?requests=accepted&reward=inactive'+(root>16?'&dynamic-type-preview='+root:'')+query);
 await page.locator('[data-action="open-event"][data-event-id="friend-weekend"]').click();
 await page.locator('[data-action="open-event-participant-add"][data-event-id="friend-weekend"]').click();
 await page.locator('.event-participant-add-route-modal [data-participant-view="friends"]').click();
 await expect(page.locator('.event-participant-add-route-modal')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
test('friends picker actual names grow from15px to30px with root32',async({page})=>{
 await page.setViewportSize({width:320,height:852});await open(page,32);
 await expect.poll(()=>page.locator('.event-participant-add-route-modal .event-participant-person-copy strong').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(30);
});
for(const[id,width,height,root,query]of [
 ['normal',393,852,16,''],['medium',360,740,20,''],['large',320,852,32,''],['short',320,390,32,''],['landscape',852,393,32,''],['long',320,852,32,'&long-names=1&long-event-name=1'],['none',393,852,16,'&picker=none'],['all',393,852,16,'&picker=all'],['none32',320,390,32,'&picker=none'],['all32',320,390,32,'&picker=all']
])test('friends picker presentation '+id,async({page},info)=>{
 await page.setViewportSize({width,height});await open(page,root,query);await geometry(page,root);const modal=page.locator('.event-friends-picker-screen');
 await modal.evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath(id+'-top.png'),animations:'disabled'});
 await modal.evaluate(e=>e.scrollTo({top:e.scrollHeight,behavior:'instant'}));await page.screenshot({path:info.outputPath(id+'-bottom.png'),animations:'disabled'});
 if(id.startsWith('none')){await expect(modal).toContainText('עוד אין חברים');await modal.locator('[data-action="open-friends-from-event-add"]').click();await expect(page.locator('.friends-empty-state')).toBeVisible()}
 else if(id.startsWith('all')){await expect(modal).toContainText('כל החברים כבר באירוע');await modal.getByRole('button',{name:'לדרכי ההזמנה',exact:true}).click();await expect(page.locator('.event-invitation-choice-screen')).toBeVisible()}
 else await expect(modal.locator('[data-action="confirm-event-participant-add"]')).toBeDisabled();
});
test('friends picker supports avatar selection, toggle, one selection, keyboard and Back without saving',async({page})=>{
 await page.setViewportSize({width:320,height:390});await open(page,32);const rows=page.locator('.event-friend-choice-row'),cta=page.locator('[data-action="confirm-event-participant-add"]');
 await rows.first().locator('.avatar').click();await expect(rows.first()).toHaveAttribute('aria-pressed','true');await expect(cta).toBeEnabled();
 await rows.first().press('Enter');await expect(rows.first()).toHaveAttribute('aria-pressed','false');await expect(cta).toBeDisabled();
 await rows.nth(1).click();await expect(rows.nth(1)).toHaveAttribute('aria-pressed','true');await expect(page.locator('.event-friend-choice-row[aria-pressed="true"]')).toHaveCount(1);
 await rows.nth(1).press('Tab');expect(await rows.nth(2).locator('.event-participant-selection-check').evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth))).toBeGreaterThanOrEqual(2);
 await page.getByRole('button',{name:'חזרה לדרכי ההוספה',exact:true}).press('Enter');await expect(page.locator('.event-invitation-choice-screen')).toBeVisible();
 await page.locator('[data-participant-view="friends"]').click();await expect(cta).toBeDisabled();
});
test('friends picker respects system text and restores it after manual preference',async({page})=>{
 await page.setViewportSize({width:320,height:390});await page.addInitScript(installSyntheticSystemText);await open(page);await geometry(page,32);
 const entry=page.locator('.event-friends-picker-screen [data-open-accessibility]');
 for(const[value,root]of [['extra-large',20],['system',32]]){await entry.click();await page.locator('.accessibility-segmented-control label:has(input[value="'+value+'"])').click();await page.keyboard.press('Escape');await expect(page.locator('.accessibility-center')).toHaveCount(0);await expect(entry).toBeFocused();await geometry(page,root)}
});


test('friends picker confirmation persists only the chosen saved person after explicit approval',async({page})=>{
 const added='saved-manual-yael';evidence.get(page).addedParticipantId=added;await open(page);
 await page.locator('.event-friend-choice-row[data-participant-id="'+added+'"]').click();
 const before=await page.evaluate(()=>{const expected=__friendInviteQa.seedFinancialEvents.find(e=>e.id==='friend-weekend').participantIds;return __friendInviteQa.snapshotWrites.every(w=>{const row=Array.isArray(w.body)?w.body[0]:w.body;return !row.state||JSON.stringify(row.state.events.find(e=>e.id==='friend-weekend').participantIds)===JSON.stringify(expected)})});expect(before).toBe(true);
 await page.locator('[data-action="confirm-event-participant-add"]').click();
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events.find(e=>e.id==='friend-weekend').participantIds.filter(p=>p===id).length,added)).toBe(1);
 await expect(page.locator('.event-friends-picker-screen')).toHaveCount(0);await page.locator('[data-action="open-event-participants"]').click();await expect(page.locator('.event-participant-roster-modal')).toBeVisible();await expect(page.locator('.event-participant-roster-modal')).toContainText('יעל ישראלי');
 const final=await page.evaluate(()=>{const e=JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events.find(e=>e.id==='friend-weekend'),seed=__friendInviteQa.seedFinancialEvents.find(e=>e.id==='friend-weekend');return{membershipAt:e.membershipUpdatedAt,membershipMarkers:e.membershipUpdatedAtByParticipant,seedMarkers:seed.membershipUpdatedAtByParticipant||{},ids:e.participantIds,expected:[...seed.participantIds,'saved-manual-yael'],activities:e.activityLog.length-seed.activityLog.length,expenses:e.expenses,seedExpenses:seed.expenses,transfers:e.transfers,seedTransfers:seed.transfers}});expect(final.ids).toEqual(final.expected);expect(final.activities).toBe(1);expect(new Date(final.membershipAt).toISOString()).toBe(final.membershipAt);expect(final.membershipMarkers).toEqual({...final.seedMarkers,[added]:final.membershipAt});expect(final.expenses).toEqual(final.seedExpenses);expect(final.transfers).toEqual(final.seedTransfers);
});
