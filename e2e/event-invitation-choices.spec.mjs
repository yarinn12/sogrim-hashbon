import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {geometry} from './helpers/eventInvitationChoices.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/eventInvitationBootstrap.js',import.meta.url),'utf8');
const evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
  const record={errors:[],external:[]};evidence.set(page,record);
  page.on('pageerror',error=>record.errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(record.external.push(route.request().url()),route.abort()));
  await page.addInitScript({content:fixture});
  for(const[env,file]of[['INVITATION_TEST_APP','app.mjs'],['INVITATION_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs'],['INVITATION_TEST_ACCESSIBILITY','publicAccessibilityLayer.mjs']])if(process.env[env])await page.route('**/src/'+file+'*',r=>r.fulfill({contentType:'text/javascript',body:readFileSync(process.env[env],'utf8')}));
});
test.afterEach(async({page})=>{
  expect(evidence.get(page).errors).toEqual([]);expect(evidence.get(page).external).toEqual([]);
  const result=await page.evaluate(()=>{
    // Sharing may add its existing credentials; every other event field must stay identical.
    const withoutShareCredentials=events=>events.map(({sharedSpaceId,sharedSpaceKey,...event})=>event);
    return {profile:__friendInviteQa.profileWrites.length,friends:__friendInviteQa.writes.length,reward:__friendInviteQa.rewardWrites.length,deletion:__friendInviteQa.deletionRequests?.length??0,shared:__friendInviteQa.shared.length,copied:__friendInviteQa.copied.length,changedEventPayload:__friendInviteQa.snapshotWrites.some(w=>{const row=Array.isArray(w.body)?w.body[0]:w.body;return row.state&&JSON.stringify(withoutShareCredentials(row.state.events))!==JSON.stringify(withoutShareCredentials(__friendInviteQa.seedFinancialEvents))})};
  });
  expect(result).toEqual({profile:0,friends:0,reward:0,deletion:0,shared:0,copied:0,changedEventPayload:false});
});
async function open(page,root=16,query=''){
  await page.goto('/?requests=accepted&reward=inactive'+(root>16?'&dynamic-type-preview='+root:'')+query);
  await page.locator('[data-action="open-event"][data-event-id="friend-weekend"]').click();
  await page.locator('[data-action="open-event-participant-add"][data-event-id="friend-weekend"]').click();
  await expect(page.locator('.event-participant-add-route-modal')).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
}
test('invitation action labels grow at root32 instead of staying15px',async({page})=>{
  await page.setViewportSize({width:320,height:852});await open(page,32);
  const label=page.locator('.event-participant-add-route-modal [data-action="open-event-share"] strong');
  await expect.poll(()=>label.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(30);
});
for(const[name,width,height,root,query]of[
  ['normal',393,852,16,''],['medium',360,740,20,''],['large',320,852,32,''],
  ['short',320,390,32,''],['landscape',852,393,32,''],['long',320,852,32,'&long-event-name=1']
])test('invitation choices presentation '+name,async({page},info)=>{
  await page.setViewportSize({width,height});await open(page,root,query);
  const modal=page.locator('.event-invitation-choice-screen');await expect(modal.locator('.new-event-participant-route-action')).toHaveCount(3);
  await expect(modal.locator('#event-modal-description')).toContainText('סוף השבוע');
  await geometry(page,root);await modal.evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:info.outputPath(name+'-top.png'),animations:'disabled'});
  await modal.evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.screenshot({path:info.outputPath(name+'-bottom.png'),animations:'disabled'});
});
test('invitation choices preserve destinations, return focus and private draft editing',async({page})=>{
  await page.setViewportSize({width:320,height:390});await open(page,32);
  const modal=page.locator('.event-invitation-choice-screen');
  await modal.locator('[data-participant-view="friends"] strong').click();
  await expect(page.locator('.event-participant-add-route-modal h2').first()).toHaveText('בחר מחברים');
  await expect(page.locator('.event-participant-add-route-modal')).toContainText('איתי כהן');
  await expect(modal).toHaveCount(0); // The choice-only styling must not leak into the picker.
  await page.locator('[data-action="event-participant-add-view-back"]').press('Enter');
  await expect(modal.locator('[data-participant-view="friends"]')).toBeFocused();
  await modal.locator('[data-participant-view="manual"] strong').click();
  await page.locator('[data-action="event-guest-name"]').fill('שם לבדיקה');
  await page.locator('[data-action="event-participant-add-view-back"]').press('Enter');
  await expect(modal.locator('[data-participant-view="friends"]')).toBeFocused();
  await modal.evaluate(e=>{e.scrollTop=0;e.focus()});await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return !!e.closest('.event-modal-header-actions')&&(parseFloat(s.outlineWidth)>0||s.boxShadow!=='none')})).toBe(true);
  await page.getByRole('button',{name:'חזרה למסך הקודם',exact:true}).press('Enter');await expect(modal).toHaveCount(0);
  await page.locator('[data-action="open-event-participant-add"][data-event-id="friend-weekend"]').click();
  await modal.locator('[data-action="open-event-share"] strong').click();
  await expect(page.locator('[data-event-share-view="link"]')).toBeVisible();
  await expect(page.locator('.event-share-link-status.is-error')).toBeVisible();
});
test('invitation choices respect enlarged system text and app preference restoration',async({page})=>{
  await page.setViewportSize({width:320,height:390});await page.addInitScript(installSyntheticSystemText);await open(page);await geometry(page,32);
  const accessibility=page.locator('.event-invitation-choice-screen [data-open-accessibility]');
  await accessibility.click();await page.locator('.accessibility-segmented-control label:has(input[value="extra-large"])').click();await page.keyboard.press('Escape');await geometry(page,20);
  await accessibility.click();await page.locator('.accessibility-segmented-control label:has(input[value="system"])').click();await page.keyboard.press('Escape');await geometry(page,32);
});

test('accessibility Escape closes only the center above an invitation route',async({page})=>{
  await open(page);const modal=page.locator('.event-participant-add-route-modal');
  await modal.locator('[data-open-accessibility]').click();await expect(page.locator('.accessibility-center')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.accessibility-center')).toHaveCount(0);
  await expect(modal).toBeVisible();await expect(page.locator('.event-invitation-choice-screen')).toBeVisible();
});
test('accessibility Tab stays inside the center above an invitation route',async({page})=>{
  await open(page);const modal=page.locator('.event-participant-add-route-modal');
  await modal.locator('[data-open-accessibility]').click();const center=page.locator('.accessibility-center');await expect(center).toBeFocused();
  await page.keyboard.press('Tab');await expect(center.getByRole('button',{name:'חזרה לאפליקציה',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(center).toHaveCount(0);await expect(modal).toBeVisible();
});


test('delayed Accessibility return never steals a newly focused invitation action',async({page})=>{
 await page.addInitScript(()=>{
  const timeout=window.setTimeout.bind(window),interval=window.setInterval.bind(window),queue=[];
  window.__holdAxReturn=false;window.__flushAxReturn=()=>{const held=queue.splice(0);for(const fn of held)fn();return held.length};
  window.setTimeout=(fn,delay,...args)=>window.__holdAxReturn&&fn?.name==='restoreFocus'?(queue.push(()=>fn(...args)),0):timeout(fn,delay,...args);
  window.setInterval=(fn,delay,...args)=>window.__holdAxReturn&&String(fn).includes('preferredTarget')?(queue.push(()=>fn(...args)),0):interval(fn,delay,...args);
 });
 await open(page);const modal=page.locator('.event-participant-add-route-modal'),entry=modal.locator('[data-open-accessibility]');
 await entry.click();await expect(page.locator('.accessibility-center')).toBeVisible();await page.evaluate(()=>window.__holdAxReturn=true);
 await page.keyboard.press('Escape');await expect(page.locator('.accessibility-center')).toHaveCount(0);await expect(entry).toBeFocused();
 const next=modal.locator('[data-participant-view="friends"]');await next.focus();
 expect(await page.evaluate(()=>window.__flushAxReturn())).toBeGreaterThan(0);await expect(next).toBeFocused();
 await next.press('Enter');await expect(modal.locator('h2').first()).toHaveText('בחר מחברים');
});
