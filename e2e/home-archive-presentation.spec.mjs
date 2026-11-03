import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {homeArchiveBootstrap} from './fixtures/homeArchiveBootstrap.mjs';
import {openHomeArchive,homeArchiveReach,homeArchiveClick,homeArchiveState,homeArchiveRecords} from './helpers/homeArchivePresentation.mjs';
const requests=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const r={errors:[],external:[]};requests.set(page,r);page.on('pageerror',e=>r.errors.push(e.message));await page.route('**/*',q=>new URL(q.request().url()).hostname==='127.0.0.1'?q.continue():(r.external.push(q.request().url()),q.abort()));
 if(process.env.HOME_ARCHIVE_BASELINE)for(const[url,file]of[['**/src/app.mjs*','baseline-app.mjs'],['**/src/publicLedgerWorkspaceLayer.mjs*','baseline-ledger.mjs'],['**/src/publicBrandLayer.mjs*','baseline-brand.mjs']])await page.route(url,q=>q.fulfill({contentType:'text/javascript',body:readFileSync(process.env.HOME_ARCHIVE_BASELINE+'/'+file,'utf8')}));
 await page.addInitScript({content:'localStorage.clear();\n'+homeArchiveBootstrap});
});
test.afterEach(async({page})=>{expect(requests.get(page).errors).toEqual([]);expect(requests.get(page).external).toEqual([])});
for(const size of [{width:393,height:852,root:16},{width:320,height:852,root:32},{width:568,height:360,root:32},{width:320,height:852,root:32,long:true},{width:320,height:852,root:32,system:true}]){
 test(`home/archive controls and letters reflow ${size.width}x${size.height} root${size.root}${size.long?' long name':''}${size.system?' system startup':''}`,async({page})=>{
  for(const view of ['menu','archive-menu','archive-empty','home-empty']){
   const screen=await openHomeArchive(page,view,size),before=homeArchiveRecords(await homeArchiveState(page));
   const target=view.endsWith('menu')?screen:screen.locator('.home-list-empty');
   const geometry=await target.evaluate(e=>{const b=e.getBoundingClientRect(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),bad=[];let n;while(n=walker.nextNode()){if(!n.textContent.trim()||n.parentElement.closest('svg,[aria-hidden="true"],.visually-hidden'))continue;const own=n.parentElement.getBoundingClientRect();if(own.width<=1||own.height<=1)continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width&&(r.left<b.left-1||r.right>b.right+1||r.left<own.left-1||r.right>own.right+1))bad.push(n.textContent.trim())}return{bad,scroll:e.scrollWidth,client:e.clientWidth,doc:document.documentElement.scrollWidth}});
   expect(geometry.bad).toEqual([]);expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);expect(geometry.doc).toBeLessThanOrEqual(size.width+1);
   const fonts=await target.locator('strong,small,p:not(.visually-hidden),h2,button').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>parseFloat(getComputedStyle(e).fontSize)));
   for(const font of fonts)expect(font).toBeGreaterThanOrEqual(size.root*.875);
   for(const button of await target.locator('button:visible:not([disabled])').all())await homeArchiveReach(page,button);
   for(const word of await page.locator('.event-primary-filter button > span').evaluateAll(es=>es.map(e=>{const b=e.parentElement.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);const rects=[...r.getClientRects()].filter(x=>x.width);return{lines:rects.length,letters:rects.every(x=>x.left>=b.left-1&&x.right<=b.right+1),width:b.width,height:b.height}}))){expect(word.lines).toBe(1);expect(word.letters).toBe(true);expect(Math.round(word.width*100)/100).toBeGreaterThanOrEqual(44);expect(Math.round(word.height*100)/100).toBeGreaterThanOrEqual(44)}
   if(view==='home-empty'){await expect(screen.locator('.product-empty-icon')).toHaveCount(0);await expect(screen.locator('.home-list-empty-icon')).toHaveCount(1);await homeArchiveReach(page,screen.locator('[data-action="new-event"]'));}
   expect(homeArchiveRecords(await homeArchiveState(page))).toEqual(before);
  }
 });
}
test('[regression] enlarged filter labels stay whole after entering and leaving archive',async({page})=>{
 const home=await openHomeArchive(page,'archive-empty',{width:320,height:852,root:32});
 const labels=()=>page.locator('.event-primary-filter button > span').evaluateAll(es=>es.map(e=>{const r=document.createRange();r.selectNodeContents(e);return[...r.getClientRects()].filter(x=>x.width).length}));
 expect(await labels()).toEqual([1,1]);await homeArchiveClick(page,home.locator('.home-list-empty [data-filter="events"]'));expect(await labels()).toEqual([1,1]);await homeArchiveClick(page,page.locator('[data-filter="archive"]').first());expect(await labels()).toEqual([1,1]);
});
test('[regression] private pin copy agrees with acknowledged account storage',async({page})=>{
 await openHomeArchive(page);const before=homeArchiveRecords(await homeArchiveState(page));await homeArchiveClick(page,page.locator('[data-action="toggle-personal-event-pin"]'));await expect(page.locator('.event-status-menu')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.personalEventPinPreferences?.updates?.['friend-weekend']?.pinned)).toBe(true);
 await homeArchiveClick(page,page.locator('[data-action="event-status-select"][data-event-id="friend-weekend"]'));await expect(page.locator('#event-pin-description')).toHaveText('ברשימה האישית שלך.');await expect(page.locator('[data-action="toggle-personal-event-pin"]')).toHaveAttribute('aria-pressed','true');
 await homeArchiveClick(page,page.locator('[data-action="toggle-personal-event-pin"]'));await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.personalEventPinPreferences?.updates?.['friend-weekend']?.pinned)).toBe(false);expect(homeArchiveRecords(await homeArchiveState(page))).toEqual(before);
});
test('[regression] owner deletion and member departure are named before their unchanged confirmations',async({page})=>{
 for(const member of [false,true]){await openHomeArchive(page,'menu',{member});const before=homeArchiveRecords(await homeArchiveState(page));const action=page.locator('[data-action="remove-event-from-list"]');await expect(action).toContainText(member?'עזיבת האירוע':'מחיקת האירוע');await homeArchiveClick(page,action);await expect(page.locator('[data-important-action-kind="'+(member?'leave-event':'delete-event')+'"]')).toBeVisible();await page.locator('[data-action="cancel-important-action"]').click();expect(homeArchiveRecords(await homeArchiveState(page))).toEqual(before)}
});
test('archive round trip and return action preserve financial and membership records',async({page})=>{
 await openHomeArchive(page,'menu',{width:320,height:852,root:32});const before=homeArchiveRecords(await homeArchiveState(page));await homeArchiveClick(page,page.locator('[data-action="toggle-personal-event-archive"]'));await expect(page.locator('.event-row[data-event-id="friend-weekend"]')).toHaveCount(0);await homeArchiveClick(page,page.locator('[data-filter="archive"]').first());await homeArchiveClick(page,page.locator('[data-action="event-status-select"][data-event-id="friend-weekend"]'));await expect(page.locator('[data-action="toggle-personal-event-archive"]')).toContainText('החזר לאירועים');await homeArchiveClick(page,page.locator('[data-action="toggle-personal-event-archive"]'));await homeArchiveClick(page,page.locator('.home-list-empty [data-filter="events"]'));await expect(page.locator('.event-row[data-event-id="friend-weekend"]')).toBeVisible();expect(homeArchiveRecords(await homeArchiveState(page))).toEqual(before);
});
test('share respects permissions and enters the approved invitation choices',async({page})=>{
 await openHomeArchive(page,'menu',{member:true});await expect(page.locator('[data-action="share-event-from-list"]')).toBeDisabled();await openHomeArchive(page);const before=homeArchiveRecords(await homeArchiveState(page));await homeArchiveClick(page,page.locator('[data-action="share-event-from-list"]'));await expect(page.locator('.event-participant-add-screen')).toBeVisible();for(const label of ['שתף קישור או QR','בחר מחברים','הוספה לפי שם'])await expect(page.locator('.event-participant-add-screen')).toContainText(label);expect(homeArchiveRecords(await homeArchiveState(page))).toEqual(before);
});
test('cancel returns focus and first-event CTA keeps cancelled types excluded',async({page})=>{
 await openHomeArchive(page);await homeArchiveClick(page,page.locator('[data-action="cancel-event-status-menu"]'));await expect(page.locator('[data-action="event-status-select"][data-event-id="friend-weekend"]')).toBeFocused();await openHomeArchive(page,'home-empty',{width:320,height:852,root:32});await homeArchiveClick(page,page.locator('[data-action="new-event"]'));await expect(page.locator('[data-event-creation-step="type"]')).toBeVisible();await expect(page.locator('[data-event-type="restaurant"]')).toHaveCount(0);await expect(page.locator('[data-action="new-event-type"]')).toHaveCount(2);
});
