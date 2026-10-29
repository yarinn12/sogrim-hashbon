import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {geometry} from './helpers/eventExistingManualParticipant.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/eventFriendsPickerBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const record={errors:[],external:[]};evidence.set(page,record);page.on('pageerror',e=>record.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(record.external.push(r.request().url()),r.abort()));
 await page.addInitScript({content:fixture});
 for(const [env,file]of [['EVENT_MANUAL_TEST_APP','app.mjs'],['EVENT_MANUAL_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']])if(process.env[env])await page.route('**/src/'+file+'*',r=>r.fulfill({contentType:'text/javascript',body:readFileSync(process.env[env],'utf8')}));
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
 await page.locator('[data-action="open-event"][data-event-id="friend-weekend"]').click();await page.locator('[data-action="open-event-participant-add"][data-event-id="friend-weekend"]').click();await page.locator('.event-participant-add-route-modal [data-participant-view="manual"]').click();await expect(page.locator('.event-participant-add-route-modal input')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
test('manual input placeholder actually grows to32px at root32',async({page})=>{
 await page.setViewportSize({width:320,height:852});await open(page,32);await expect.poll(()=>page.locator('.event-participant-add-route-modal input').evaluate(e=>parseFloat(getComputedStyle(e,'::placeholder').fontSize))).toBe(32);
});
for(const[id,width,height,root,query,value,invalid]of [
 ['normal',393,852,16,'','',false],['medium',360,740,20,'','',false],['large',320,852,32,'','',false],['short',320,390,32,'','',false],['landscape',852,393,32,'','',false],['long',320,852,32,'&long-event-name=1','אלכסנדר ישראלי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ',false],['filled',393,852,16,'','אורן ישראלי',false],['validation',393,852,16,'','',true],['short-validation',320,390,32,'','',true]
])test('existing manual presentation '+id,async({page},info)=>{
 await page.setViewportSize({width,height});await open(page,root,query);const m=page.locator('.event-manual-name-screen'),input=m.locator('input');if(value)await input.fill(value);if(invalid){await m.locator('[data-action="event-add-guest"]').click();await expect(input).toHaveAttribute('aria-invalid','true');expect(await m.evaluate(e=>{const form=e.querySelector('.event-participant-offline-form'),error=e.querySelector('.field-error'),button=e.querySelector('[data-action="event-add-guest"]');return form.nextElementSibling===error&&error.nextElementSibling===button})).toBe(true)}await geometry(page,root);if(value)await expect(input).toHaveValue(value);await expect(m.locator('h2')).toHaveText('הוספת משתתף לפי שם');await expect(m.locator('.participant-add-privacy-note')).toHaveCount(0);
 await m.evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath(id+'-top.png'),animations:'disabled'});await m.evaluate(e=>e.scrollTo({top:e.scrollHeight,behavior:'instant'}));await page.screenshot({path:info.outputPath(id+'-bottom.png'),animations:'disabled'});
});
test('existing manual empty and Unicode whitespace errors clear with typing; keyboard and Back do not save',async({page})=>{
 await page.setViewportSize({width:320,height:390});await open(page,32);const input=page.locator('.event-manual-name-screen input'),cta=page.locator('.event-manual-name-screen [data-action="event-add-guest"]');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await expect(input).toBeFocused();await input.fill('\u200b \u2060');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await input.fill('אורן ישראלי');await expect(input).not.toHaveAttribute('aria-invalid','true');await expect(page.locator('.event-manual-name-screen .field-error')).toHaveCount(0);await input.press('Tab');await expect(cta).toBeFocused();await page.getByRole('button',{name:'חזרה לדרכי ההוספה',exact:true}).press('Enter');await expect(page.locator('.event-invitation-choice-screen')).toBeVisible();await page.locator('[data-participant-view="manual"]').click();await expect(input).toHaveValue('');
});
test('existing manual restores system text and retains the typed name when preferences change',async({page})=>{
 await page.setViewportSize({width:320,height:390});await page.addInitScript(installSyntheticSystemText);await open(page);await geometry(page,32);const input=page.locator('.event-manual-name-screen input'),entry=page.locator('.event-manual-name-screen [data-open-accessibility]');await input.fill('אורן ישראלי');for(const[value,root]of[['extra-large',20],['system',32]]){await entry.click();await page.locator('.accessibility-segmented-control label:has(input[value="'+value+'"])').click();await page.keyboard.press('Escape');await expect(page.locator('.accessibility-center')).toHaveCount(0);await expect(entry).toBeFocused();await geometry(page,root);await expect(input).toHaveValue('אורן ישראלי')}
});
for(const[name,existingId,keyboard]of[['אורן ישראלי',null,false],['יעל ישראלי','saved-manual-yael',true]])test('existing manual explicit '+(keyboard?'Enter reuses a saved manual person':'Add creates one manual person')+' without changing expenses',async({page})=>{
 await open(page);const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.participants.map(p=>p.id));await page.getByRole('textbox',{name:'שם המשתתף',exact:true}).fill(name);
 expect(await page.evaluate(name=>__friendInviteQa.snapshotWrites.every(w=>{const row=Array.isArray(w.body)?w.body[0]:w.body;return !row.state||!row.state.events.find(e=>e.id==='friend-weekend').participantIds.some(id=>row.state.participants.find(p=>p.id===id)?.displayName===name)}),name)).toBe(true);
 if(keyboard)await page.getByRole('textbox',{name:'שם המשתתף',exact:true}).press('Enter');else await page.locator('.event-manual-name-screen [data-action="event-add-guest"]').click();
 await expect.poll(()=>page.evaluate(name=>{const state=JSON.parse(localStorage.getItem('qa-invite-server-row')).state;return state.events.find(e=>e.id==='friend-weekend').participantIds.filter(id=>state.participants.find(p=>p.id===id)?.displayName===name).length},name)).toBe(1);
 const final=await page.evaluate(name=>{const state=JSON.parse(localStorage.getItem('qa-invite-server-row')).state,p=state.participants.find(p=>p.displayName===name&&p.kind==='guest'),event=state.events.find(e=>e.id==='friend-weekend'),seed=__friendInviteQa.seedFinancialEvents.find(e=>e.id==='friend-weekend');return{person:p,people:state.participants.map(p=>p.id),ids:event.participantIds,seedIds:seed.participantIds,activities:event.activityLog.length-seed.activityLog.length,membershipAt:event.membershipUpdatedAt,markers:event.membershipUpdatedAtByParticipant,seedMarkers:seed.membershipUpdatedAtByParticipant||{}}},name);evidence.get(page).addedParticipantId=final.person.id;
 if(existingId)expect(final.person.id).toBe(existingId);expect(final.people).toEqual(existingId?before:[...before,final.person.id]);expect(final.ids).toEqual([...final.seedIds,final.person.id]);expect(final.activities).toBe(1);expect(final.person.kind).toBe('guest');expect(final.person.authSubject).toBeFalsy();expect(final.person.accountLinked).toBeFalsy();expect(new Date(final.membershipAt).toISOString()).toBe(final.membershipAt);expect(final.markers).toEqual({...final.seedMarkers,[final.person.id]:final.membershipAt});await expect(page.locator('.event-manual-name-screen')).toHaveCount(0);await page.locator('[data-action="open-event-participants"]').click();await expect(page.locator('.event-participant-roster-modal')).toContainText(name);
});
