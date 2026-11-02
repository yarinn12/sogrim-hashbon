import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openIdentity,separateIdentities,identityGeometry,identityState,identityMoney,saveIdentityAlias,identityAccount,identityOffline} from './helpers/participantIdentityPresentation.mjs';
import {pointClick,paint} from './helpers/eventNotesBatchPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/eventNotesBatchBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{const r={errors:[],external:[]};evidence.set(page,r);page.on('pageerror',e=>r.errors.push(e.message));await page.route('**/*',q=>new URL(q.request().url()).hostname==='127.0.0.1'?q.continue():(r.external.push(q.request().url()),q.abort()));await page.addInitScript({content:fixture});});
test.afterEach(async({page})=>{const r=evidence.get(page);expect(r.errors).toEqual([]);expect(r.external).toEqual([]);});
test('alias fields honor enlarged text and the save action stays readable',async({page})=>{
 const d=await openIdentity(page,'aliases',{width:320,root:32});
 await expect(d.locator('[data-action="participant-alias"]').first()).toHaveCSS('font-size','32px');
 const save=d.locator('[data-action="save-participant-alias"]').first();
 const lines=await save.evaluate(e=>{const ys=new Set(),w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);for(let n=w.nextNode();n;n=w.nextNode()){if(!n.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(n);for(const b of r.getClientRects())if(b.width&&b.height)ys.add(Math.round(b.top))}return ys.size});
 expect(lines,'the single save word must not be split into vertical letters').toBe(1);

});
for(const[name,opts]of[['normal',{}],['large',{width:320,root:32}],['medium',{width:411,root:20}],['landscape',{width:568,height:360,root:32}],['system',{width:320,height:390,system:true}],['long',{width:320,root:32,query:'&identity-long=1'}]])test('identity review and alias screens reflow '+name,async({page})=>{
 for(const view of ['identity','separate','aliases','accounts']){
  const d=await openIdentity(page,view,opts),before=identityMoney(await identityState(page));
  await identityGeometry(page,d,opts.system?32:opts.root||16);
  if(view==='accounts')await expect(d.locator('[data-action="connect-duplicate-participant"]')).toHaveCount(0);
  if(view==='separate')await expect(d.locator('.participant-aliases')).not.toHaveAttribute('open');
  if(view==='aliases')await expect(d.locator('input')).toHaveCount(2);
  expect(identityMoney(await identityState(page))).toEqual(before);
 }
});
test('link confirmation cancellation and defer do not change identity or money',async({page})=>{
 const d=await openIdentity(page),before=await identityState(page),writes=await page.evaluate(()=>__friendInviteQa.canonicalWrites.length);
 await pointClick(d.locator('[data-action="connect-duplicate-participant"]'));
 const c=page.locator('.event-participant-action-confirmation');await expect(c).toBeVisible();await expect(c).toContainText('לקשר לחשבון?');
 await pointClick(c.locator('[data-action="cancel-important-action"]'));await expect(d).toBeVisible();
 await pointClick(d.locator('[data-action="defer-duplicate-participant"]'));await expect(page.locator('[data-event-participant-roster]')).toBeVisible();
 expect(identityMoney(await identityState(page))).toEqual(identityMoney(before));expect(await page.evaluate(()=>__friendInviteQa.canonicalWrites.length)).toBe(writes);
});
test('separation and aliases receive canonical and personal acknowledgements in this event only',async({page})=>{
 const d=await openIdentity(page),before=await identityState(page);await separateIdentities(page,d);
 await expect(d.locator('.participant-identity-result')).toHaveText('נשמר. אלה שני אנשים נפרדים.');
 const key=[identityAccount,identityOffline].sort().join('~');expect(await page.evaluate(()=>__friendInviteQa.canonicalSnapshot.state.events[0].distinctParticipantPairs)).toEqual([key]);
 await saveIdentityAlias(page,d,identityOffline,'מהעבודה');
 const requests=await page.evaluate(()=>__friendInviteQa.canonicalRequests);const saved=requests.findLast(r=>r.p_state.events[0].participantAliases?.[identityOffline]==='מהעבודה');
 expect(saved.p_snapshot_id).toBe('synthetic-share-event-space');expect(saved.p_state.events).toHaveLength(1);expect(saved.p_state.events[0].id).toBe('friend-weekend');expect(Date.parse(saved.p_state.events[0].participantAliasUpdatedAtByParticipant[identityOffline])).toBeGreaterThan(0);
 const after=await identityState(page);expect(after.participants.map(p=>[p.id,p.displayName])).toEqual(before.participants.map(p=>[p.id,p.displayName]));expect(after.events[1].participantAliases).toEqual(before.events[1].participantAliases);expect(identityMoney(after)).toEqual(identityMoney(before));
 await pointClick(d.locator('.identity-review-return'));await expect(page.locator('[data-event-participant-roster]')).toContainText('מהעבודה');
});
test('clearing an alias persists a newer tombstone without removing the participant',async({page})=>{
 const d=await openIdentity(page,'aliases'),before=identityMoney(await identityState(page));await saveIdentityAlias(page,d,identityOffline,'מהעבודה');
 const previous=await page.evaluate(id=>__friendInviteQa.canonicalSnapshot.state.events[0].participantAliasUpdatedAtByParticipant[id],identityOffline);
 await saveIdentityAlias(page,d,identityOffline,'');const next=await page.evaluate(id=>__friendInviteQa.canonicalSnapshot.state.events[0].participantAliasUpdatedAtByParticipant[id],identityOffline);expect(Date.parse(next)).toBeGreaterThan(Date.parse(previous));expect(identityMoney(await identityState(page))).toEqual(before);
});
test('two real accounts keep separate usernames and never offer merging',async({page})=>{
 const d=await openIdentity(page,'accounts');await expect(d.locator('[data-action="connect-duplicate-participant"]')).toHaveCount(0);await expect(d.locator('.participant-username')).toHaveCount(2);
 await pointClick(d.locator('.modal-section-back-button[data-action="participant-identities-back"]'));await expect(page.locator('[data-event-participant-roster]')).toBeVisible();
});
test('rejected alias save rolls back only its acknowledged alias and can be retried',async({page})=>{
 const d=await openIdentity(page,'aliases'),before=identityMoney(await identityState(page));
 await page.evaluate(()=>__friendInviteQa.identityWriteMode='reject');
 await d.locator('[data-action="participant-alias"][data-participant-id="'+identityOffline+'"]').fill('מהעבודה');
 await pointClick(d.locator('[data-action="save-participant-alias"][data-participant-id="'+identityOffline+'"]'));
 await expect(page.locator('#app')).toContainText('לא הצלחנו לשמור את הכינוי');
 await expect(d.locator('[data-action="participant-alias"][data-participant-id="'+identityOffline+'"]')).toHaveValue('מהעבודה');
 expect(await page.evaluate(id=>__friendInviteQa.canonicalSnapshot.state.events[0].participantAliases?.[id],identityOffline)).toBeUndefined();
 expect(identityMoney(await identityState(page))).toEqual(before);await page.evaluate(()=>__friendInviteQa.identityWriteMode='ready');
 await saveIdentityAlias(page,d,identityOffline,'מהעבודה');
});

test('a newer typed alias survives an earlier acknowledgement without another write',async({page})=>{
 const d=await openIdentity(page,'aliases'),before=identityMoney(await identityState(page));
 const input=d.locator('[data-action="participant-alias"][data-participant-id="'+identityOffline+'"]');
 await page.evaluate(()=>__friendInviteQa.identityWriteMode='hold');await input.fill('טיוטה ראשונה');
 await pointClick(d.locator('[data-action="save-participant-alias"][data-participant-id="'+identityOffline+'"]'));
 await expect.poll(()=>page.evaluate(()=>__friendInviteQa.identityAttempts.some(x=>x.kind==='canonical'))).toBe(true);
 await input.fill('טיוטה חדשה');await page.evaluate(()=>__friendInviteQa.releaseIdentityWrite());
 await expect.poll(()=>page.evaluate(id=>__friendInviteQa.canonicalSnapshot.state.events[0].participantAliases?.[id],identityOffline)).toBe('טיוטה ראשונה');
 await expect(input).toHaveValue('טיוטה חדשה');
 expect(identityMoney(await identityState(page))).toEqual(before);
 await saveIdentityAlias(page,d,identityOffline,'טיוטה חדשה');
});

test('a pending alias acknowledgement does not restore a closed dialog lock',async({page})=>{
 const d=await openIdentity(page,'aliases'),before=identityMoney(await identityState(page));
 await page.evaluate(()=>__friendInviteQa.identityWriteMode='hold');
 await d.locator('[data-action="participant-alias"][data-participant-id="'+identityOffline+'"]').fill('מהעבודה');
 await pointClick(d.locator('[data-action="save-participant-alias"][data-participant-id="'+identityOffline+'"]'));
 await expect.poll(()=>page.evaluate(()=>__friendInviteQa.identityAttempts.some(x=>x.kind==='canonical'))).toBe(true);
 await pointClick(d.locator('.modal-section-back-button[data-action="participant-identities-back"]'));
 await pointClick(page.locator('.event-participant-roster-modal [data-action="event-participants-back"]'));
 await expect(page.locator('.event-modal')).toHaveCount(0);await page.evaluate(()=>__friendInviteQa.releaseIdentityWrite());
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events[0].participantAliases?.[id],identityOffline)).toBe('מהעבודה');
 await paint(page);await expect(page.locator('body')).not.toHaveClass(/app-dialog-open/);
 expect(identityMoney(await identityState(page))).toEqual(before);
 await pointClick(page.locator('[data-action="open-event-participants"]'));await expect(page.locator('.event-participant-roster-modal')).toBeVisible();
});
