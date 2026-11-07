import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {profileFriendsCardsBootstrap} from './fixtures/profileFriendsCardsBootstrap.mjs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
import {presentationReach as reach,presentationClick as click} from './helpers/profileFriendsCardsPresentation.mjs';

const logs=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page,baseURL})=>{
 const errors=[],external=[];logs.set(page,{errors,external});page.on('pageerror',e=>errors.push(e.message));
 const localOrigin=new URL(baseURL).origin;
 // WebKit routes locally-created Blob image loads as well as HTTP. They carry
 // the QA page origin and make no external request. Inline image bytes are local too.
 await page.route('**/*',q=>{
  const url=new URL(q.request().url());
  const ownOrigin=url.origin===localOrigin&&['http:','blob:'].includes(url.protocol);
  const inlineImage=url.protocol==='data:'&&q.request().resourceType()==='image'&&url.href.startsWith('data:image/');
  if(ownOrigin||inlineImage)return q.continue();
  external.push(q.request().url());return q.abort();
 });
 if(process.env.PROFILE_FRIENDS_CARDS_BASELINE)for(const[url,file]of [['**/src/app.mjs*','baseline-app.mjs'],['**/src/publicLedgerWorkspaceLayer.mjs*','baseline-ledger.mjs'],['**/src/publicBrandLayer.mjs*','baseline-brand.mjs']])await page.route(url,q=>q.fulfill({contentType:'text/javascript',body:readFileSync(process.env.PROFILE_FRIENDS_CARDS_BASELINE+'/'+file,'utf8')}));
 await page.addInitScript({content:'localStorage.clear();\n'+profileFriendsCardsBootstrap});
});
test.afterEach(async({page})=>{expect(logs.get(page).errors).toEqual([]);expect(logs.get(page).external).toEqual([])});

const records=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')).events.map(e=>({id:e.id,name:e.name,currency:e.currency,expenses:e.expenses,transfers:e.transfers,participantIds:e.participantIds,adminIds:e.adminIds,createdByParticipantId:e.createdByParticipantId})));
async function open(page,view,{width=393,height=852,root=16,system=false,unbroken=false}={}){
 await page.setViewportSize({width,height});if(system)await page.addInitScript(installSyntheticSystemText);
 await page.goto('/?review=1&preview='+view+(root>16&&!system?'&dynamic-type-preview='+root:'')+(unbroken?'&unbroken=1':''));
 await expect(page.locator('.event-row')).toHaveCount(3);
 if(view!=='long-cards'){
  await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).getByRole('button',{name:view==='avatar'?'פרופיל':'חברים',exact:true}).click();
  if(view==='avatar'){
   const shell=page.locator('.profile-avatar-picker-shell');await expect(shell).toBeVisible();if(!await shell.evaluate(e=>e.open))await shell.locator('summary').click();await expect(page.locator('.profile-avatar-upload').first()).toBeVisible();
  }else{await page.locator('[data-action="friends-search"]').fill('מיכל');await expect(page.locator('[data-friends-search-empty]')).toBeVisible()}
 }
 await page.evaluate(()=>document.fonts.ready);
 return page.locator(view==='avatar'?'.profile-avatar-picker-shell':view==='friends-empty'?'.friends-search-empty':'.event-list');
}
async function wholeTitleWords(page){
 const words=await page.locator('.event-row-title strong').evaluateAll(es=>es.flatMap(e=>{const n=e.firstChild,all=[];for(const m of n.textContent.matchAll(/[\u0590-\u05ff]+/g)){const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);all.push({word:m[0],lines:[...r.getClientRects()].filter(x=>x.width).length})}return all}));
 for(const word of words)expect(word.lines,word.word).toBe(1);
}
for(const size of [{width:393,height:852,root:16},{width:320,height:852,root:32},{width:568,height:360,root:32},{width:320,height:852,root:32,system:true}])test(`three approved areas reflow ${size.width}x${size.height} root${size.root}${size.system?' system startup':''}`,async({page})=>{
 for(const view of ['avatar','friends-empty','long-cards']){
  const target=await open(page,view,size),before=await records(page);
  const geometry=await target.evaluate(e=>{const box=e.getBoundingClientRect(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),bad=[];let n;while(n=walker.nextNode()){if(!n.textContent.trim()||n.parentElement.closest('svg,[aria-hidden="true"],.visually-hidden,option'))continue;const own=n.parentElement.getBoundingClientRect();if(own.width<=1||own.height<=1)continue;const r=document.createRange();r.selectNodeContents(n);for(const a of r.getClientRects())if(a.width&&a.height&&(a.left<box.left-1||a.right>box.right+1||a.left<own.left-1||a.right>own.right+1))bad.push(n.textContent.trim())}return{width:document.documentElement.scrollWidth,scroll:e.scrollWidth,client:e.clientWidth,bad}});
  expect(geometry.width).toBeLessThanOrEqual(size.width+1);expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);expect(geometry.bad).toEqual([]);
  const fonts=await target.locator(view==='avatar'?'.profile-avatar-source-copy strong,legend,.profile-avatar-summary-copy strong':view==='friends-empty'?'strong,span,button':'.event-row-title strong,.event-row-state,.event-row-details').evaluateAll(es=>es.map(e=>parseFloat(getComputedStyle(e).fontSize)));
  for(const font of fonts)expect(font).toBeGreaterThanOrEqual(size.root*.875);
  if(view==='avatar')for(const c of await target.locator('summary,.profile-avatar-upload,.profile-avatar-option').all())await reach(page,c);
  else if(view==='friends-empty'){await reach(page,target.locator('button'));await reach(page,page.locator('[data-action="friends-search"]'));expect(await page.locator('[data-action="friends-search"]').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180)}
  else{await wholeTitleWords(page);for(const c of await target.locator('[data-action="event-status-select"]').all())await reach(page,c)}
  expect(await records(page)).toEqual(before);
 }
});

test('[regression] profile source labels grow with system text before opening',async({page})=>{
 await open(page,'avatar',{width:320,height:852,root:32,system:true});
 for(const size of await page.locator('.profile-avatar-source-copy strong').evaluateAll(es=>es.map(e=>parseFloat(getComputedStyle(e).fontSize))))expect(size).toBeGreaterThanOrEqual(28);
});
test('[regression] long event names retain whole Hebrew words at enlarged text',async({page})=>{
 await open(page,'long-cards',{width:320,height:852,root:32});await wholeTitleWords(page);
});
test('[regression] no-result search has a reset that restores the roster and focus',async({page})=>{
 await open(page,'friends-empty',{width:320,height:852,root:32});const before=await records(page);
 const clear=page.getByRole('button',{name:'ניקוי החיפוש',exact:true});await expect(clear).toBeVisible();await click(page,clear);
 await expect(page.locator('[data-action="friends-search"]')).toHaveValue('');await expect(page.locator('[data-action="friends-search"]')).toBeFocused();await expect(page.locator('[data-friends-search-empty]')).toBeHidden();expect(await page.locator('[data-friend-name]:visible').count()).toBeGreaterThanOrEqual(5);
 await page.locator('[data-action="friends-search"]').fill('dana_levi');await expect(page.locator('[data-friend-name]:visible')).toHaveCount(1);expect(await records(page)).toEqual(before);
});
test('[regression] landscape enlarged avatar controls fit between fixed navigation',async({page})=>{
 const target=await open(page,'avatar',{width:320,height:852,root:32});await page.setViewportSize({width:568,height:360});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));for(const c of await target.locator('.profile-avatar-upload,.profile-avatar-option').all())await reach(page,c);
});
test('mixed-language unbroken names stay within the event card',async({page})=>{
 const target=await open(page,'long-cards',{width:320,height:852,root:32,unbroken:true});expect(await target.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});
test('preset acknowledgement and gallery versus camera inputs preserve event records',async({page})=>{
 await open(page,'avatar',{width:320,height:852,root:32});const before=await records(page);await click(page,page.locator('.profile-avatar-option').nth(1));
 await expect.poll(()=>page.evaluate(()=>globalThis.__friendInviteQa.profileWrites.some(w=>w.avatar_preset==='avatar-2'))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-local-profile:account:11111111-1111-4111-8111-111111111111')).avatarPreset)).toBe('avatar-2');
 await expect(page.locator('.profile-avatar-picker-shell')).not.toHaveAttribute('open','');await click(page,page.locator('.profile-avatar-picker-summary'));await expect(page.locator('input[name="avatarPreset"][value="avatar-2"]')).toBeChecked();
 for(const source of ['gallery','camera']){const chooser=page.waitForEvent('filechooser');await click(page,page.locator('[data-action="choose-profile-avatar-image"][data-image-source="'+source+'"]'));const opened=await chooser;expect(opened.isMultiple()).toBe(false);await opened.setFiles([]);const input=page.locator('input[data-action="profile-avatar-image"][data-image-source="'+source+'"]');expect(await input.getAttribute('accept')).toBe('image/*');expect(await input.getAttribute('capture')).toBe(source==='camera'?'environment':null)}
 expect(await records(page)).toEqual(before);
});
test('full event name survives options cancel focus and normal card navigation',async({page})=>{
 await open(page,'long-cards',{width:320,height:852,root:32});const before=await records(page),options=page.locator('[data-action="event-status-select"][data-event-id="friend-weekend"]');await click(page,options);await expect(page.locator('.event-status-menu h2')).toHaveText(before[0].name);await click(page,page.locator('[data-action="cancel-event-status-menu"]'));await expect(options).toBeFocused();
 const rowOpen=page.locator('[data-action="open-event"][data-event-id="friend-weekend"]');await rowOpen.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const point=await rowOpen.evaluate(e=>{const r=e.getBoundingClientRect(),nav=document.querySelector('[aria-label="ניווט ראשי"]').getBoundingClientRect(),x=r.x+r.width/2,y=(Math.max(r.top,75)+Math.min(r.bottom,nav.top-8))/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))}});expect(point.hit).toBe(true);await page.mouse.click(point.x,point.y);await expect(page.locator('[data-screen-kind="event"]')).toBeVisible();expect(await records(page)).toEqual(before);
});

test('gallery image crop save and removal acknowledge only the profile and preserve event records',async({page})=>{
 await open(page,'avatar',{width:320,height:852,root:32});const before=await records(page);
 const chooser=page.waitForEvent('filechooser');await click(page,page.locator('[data-action="choose-profile-avatar-image"][data-image-source="gallery"]'));
 const file=await chooser;await file.setFiles({name:'qa-avatar.png',mimeType:'image/png',buffer:readFileSync(new URL('../assets/avatars/avatar-3.png',import.meta.url))});
 const crop=page.locator('.image-crop-dialog[open]');await expect(crop).toBeVisible();await expect(crop.locator('[data-crop-preview]')).toBeVisible();await crop.locator('[data-crop-action="confirm"]').click();await expect(crop).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>globalThis.__friendInviteQa.profileWrites.some(w=>String(w.avatar_image??'').startsWith('data:image/')))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>String(JSON.parse(localStorage.getItem('settle-friends-local-profile:account:11111111-1111-4111-8111-111111111111')).avatarImage??'').startsWith('data:image/'))).toBe(true);
 const writes=await page.evaluate(()=>globalThis.__friendInviteQa.profileWrites.length),shell=page.locator('.profile-avatar-picker-shell');if(!await shell.evaluate(e=>e.open))await click(page,shell.locator('summary'));
 const remove=page.getByRole('button',{name:'הסרת התמונה',exact:true});await reach(page,remove);expect(await remove.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(28);await click(page,remove);
 await expect.poll(()=>page.evaluate(n=>globalThis.__friendInviteQa.profileWrites.length>n&&!globalThis.__friendInviteQa.profileWrites.at(-1).avatar_image,writes)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>Boolean(JSON.parse(localStorage.getItem('settle-friends-local-profile:account:11111111-1111-4111-8111-111111111111')).avatarImage))).toBe(false);
 if(!await shell.evaluate(e=>e.open))await click(page,shell.locator('summary'));await expect(page.locator('[data-action="remove-profile-avatar-image"]')).toHaveCount(0);expect(await records(page)).toEqual(before);
});
