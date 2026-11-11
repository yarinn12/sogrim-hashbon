import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {installSyntheticSystemText} from './helpers/accessibilityPresentation.mjs';
import {geometry,finish,readable} from './helpers/syncNoticePresentation.mjs';

test('sync feedback compact disclosure keeps keyboard access and never acknowledges a queued write',async({page},info)=>{
 await start(page,{scene:'home',scenario:'permission',root:16,width:393});
 const notice=page.locator('[data-sync-account-summary]'),disclosure=notice.locator('[data-sync-pending-notice]');
 const toggle=disclosure.locator(':scope > summary');
 const pending=()=>page.evaluate(()=>localStorage.getItem(__friendInviteQa.pendingKey));
 const before=await pending();
 await toggle.focus();await toggle.press('Enter');
 await expect(disclosure).not.toHaveAttribute('open','');
 await expect(notice.locator('[data-sync-retry]')).not.toBeVisible();
 expect((await notice.boundingBox()).height).toBeLessThanOrEqual(64);
 await expect(notice).toHaveCSS('border-inline-start-width','0px');
 await page.evaluate(()=>__syncNoticePreview.emit({status:'reconnecting',pending:true,pendingEventIds:['friend-weekend','friend-friday'],failureKind:'permission'}));
 await expect(disclosure).not.toHaveAttribute('open','');
 await expect(toggle).toBeFocused();
 expect(await pending()).toBe(before);
 await toggle.press('Enter');
 await expect(notice.locator('[data-sync-retry]')).toBeVisible();
 await expect(notice.locator('[data-sync-event-details]')).not.toHaveAttribute('open','');
 await expect.poll(()=>notice.evaluate(n=>({
   outerOpen:n.querySelector('[data-sync-pending-notice]').open,
   innerOpen:n.querySelector('[data-sync-event-details]').open,
   differentDirections:getComputedStyle(n.querySelector('[data-sync-pending-notice] > summary .sync-pending-chevron')).transform!==
     getComputedStyle(n.querySelector('[data-sync-event-details] > summary .sync-pending-chevron')).transform
 }))).toEqual({outerOpen:true,innerOpen:false,differentDirections:true});
 expect(await pending()).toBe(before);
 await info.attach('disclosure-preserves-outbox',{body:JSON.stringify({pendingUnchanged:true,keyboard:true}),contentType:'application/json'});
});
const fixture=readFileSync(new URL('./fixtures/syncNoticeBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{const r={errors:[],external:[]};evidence.set(page,r);page.on('pageerror',e=>r.errors.push(e.message));await page.route('**/*',q=>new URL(q.request().url()).hostname==='127.0.0.1'?q.continue():(r.external.push(q.request().url()),q.abort()));await page.addInitScript({content:fixture})});
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus){const body=JSON.stringify(await page.evaluate(()=>__syncNoticePreview));writeFileSync(info.outputPath('source-events.json'),body);await info.attach('sync-source-events',{body,contentType:'application/json'});}await finish({p:page,...evidence.get(page)})});
async function start(p,{width=320,height=852,root=32,scene='share',scenario='offline',query=''}={}) {
 await p.setViewportSize({width,height});
 await p.goto('/?review=1&requests=accepted&reward=inactive&scene='+scene+'&sync-scenario='+scenario+(root>16?'&dynamic-type-preview='+root:'')+query);
 await expect(p.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]')).toBeVisible();
 if(scene==='share') {
  await p.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]').click();
  await p.locator('[data-action="open-event-participant-add"][data-event-id="friend-weekend"]').click();
  await p.locator('.event-participant-add-route-modal [data-action="open-event-share"]').click();
  await expect(p.locator('.event-share-modal [data-event-share-view="link"]')).toBeVisible();
  if(scenario!=='permission')await expect(p.locator('.event-share-modal input[data-share-ready="true"]')).toHaveCount(1);
 }
 await p.evaluate(()=>document.fonts.ready);
 await expect.poll(()=>p.evaluate(()=>document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)&&a.playState==='running').length)).toBe(0);
 // Drain actual already queued bootstrap writes in the page module context. Do
 // not do this in a WebKit init script (which has no module script origin).
 if(scene==='share'&&['offline','conflict'].includes(scenario))await p.evaluate(async()=>{const store=await import('/src/data/localStore.mjs');await store.flushPendingSharedState({automatic:true})});
 await p.evaluate(({scenario,query})=>{const ids=query.includes('pending-events=one')?['friend-weekend']:['friend-weekend','friend-friday'];const detail=scenario==='permission'?{status:'reconnecting',pending:true,pendingEventIds:ids,failureKind:'permission'}:scenario==='conflict'?{status:'conflict',pending:false}:scenario==='routine'?{status:'saving',pending:true,pendingEventIds:ids,failureKind:''}:{status:'offline',pending:false};__syncNoticePreview.emit(detail);__syncNoticePreview.initialized=true},{scenario,query});
 if(scene==='home'&&scenario==='permission')await p.locator('[data-sync-pending-notice] > summary').click();
 return{p,root,scene,scenario,...evidence.get(p)};
}

const profiles=[['landscape',852,393,32,'share','offline',''],['offline',393,852,16,'share','offline',''],['offline-large',320,852,32,'share','offline',''],['offline-short',320,390,32,'share','offline',''],['conflict',320,852,32,'share','conflict',''],['permission-home',393,852,16,'home','permission',''],['permission-large',320,852,32,'home','permission',''],['permission-route',320,852,32,'share','permission','&pending-events=one'],['routine',393,852,16,'home','routine',''],['permission-short',320,390,32,'home','permission',''],['offline-medium',360,740,20,'share','offline',''],['permission-medium',360,740,20,'home','permission','']];
test('sync feedback actual leaf grows to 28px at root32',async({page})=>{await start(page);await expect(page.locator('[data-sync-status] .app-toast-copy')).toHaveCSS('font-size','28px');await expect(page.locator('[data-sync-status]')).toHaveCSS('position','static')});
for(const[id,width,height,root,scene,scenario,query]of profiles)test('sync feedback '+id,async({page})=>{await geometry(await start(page,{width,height,root,scene,scenario,query}))});
test('sync feedback survives rerender and Enter dismissal stays closed',async({page})=>{await start(page,{height:390});await expect(page.locator('.sync-inline-notice')).toBeVisible();await page.locator('.event-share-modal .modal-section-back-button').click();await expect(page.locator('.event-participant-add-route-modal .event-modal-body > [data-sync-status]')).toBeVisible();await expect(page.locator('[data-sync-status]')).toHaveCount(1);const close=page.locator('[data-sync-dismiss]');await close.focus();await close.press('Enter');await expect(page.locator('[data-sync-status]')).not.toBeVisible();await page.evaluate(()=>__syncNoticePreview.emit({status:'reconnecting',pending:false}));await expect(page.locator('[data-sync-status]')).not.toBeVisible()});
test('sync feedback routine saving and recovery stay quiet',async({page})=>{await start(page);for(const status of['saving','saved','reconnecting','unavailable']){await page.evaluate(status=>__syncNoticePreview.emit({status,pending:false}),status);await expect(page.locator('[data-sync-status]')).not.toBeVisible()}});
test('sync feedback blocked retry keeps both pending events and details',async({page})=>{await start(page,{scene:'home',scenario:'permission'});const summary=page.locator('.sync-pending-context');await summary.locator('[data-sync-event-details] > summary').click();await expect(summary.locator('[data-sync-event-details]')).toHaveAttribute('open','');await expect(summary.locator('li')).toHaveCount(2);for(const li of await summary.locator('li').all())await readable(li);const before=await page.evaluate(()=>__friendInviteQa.failedPendingAttempts.length);await summary.locator('[data-sync-retry]').click();await expect.poll(()=>page.evaluate(()=>__friendInviteQa.failedPendingAttempts.length)).toBeGreaterThan(before);await expect(summary.locator('[data-sync-retry]')).toBeEnabled();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(__friendInviteQa.pendingKey)).__pendingSync.selection.eventIds.sort())).toEqual(['friend-friday','friend-weekend']);await expect(summary).toBeVisible()});
test('sync feedback only a canonical ACK clears the pending queue',async({page})=>{
 await start(page,{scene:'home',scenario:'permission',root:16,width:393,query:'&pending-events=one'});
 expect(await page.evaluate(()=>localStorage.getItem(__friendInviteQa.pendingKey))).not.toBeNull();
 expect(await page.evaluate(()=>__friendInviteQa.canonicalWrites.length)).toBe(0);
 // Keep background writes rejected until a real retry activation. Granting the
 // fixture permission earlier lets a valid background ACK remove the button
 // while WebKit is still waiting for pointer stability.
 await page.evaluate(()=>{
   document.addEventListener('click',function grant(event){
     if(!event.target.closest?.('.sync-pending-context [data-sync-retry]'))return;
     __friendInviteQa.retryActivations=(__friendInviteQa.retryActivations||0)+1;
     __friendInviteQa.allowPendingAcknowledgement=true;
     document.removeEventListener('click',grant,true);
   },true);
 });
 await page.locator('.sync-pending-context [data-sync-retry]').click();
 expect(await page.evaluate(()=>__friendInviteQa.retryActivations)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem(__friendInviteQa.pendingKey))).toBeNull();
 await expect(page.locator('[data-sync-account-summary]')).not.toBeVisible();
 expect(await page.evaluate(()=>__friendInviteQa.canonicalWrites.length)).toBeGreaterThan(0);
});
test('sync feedback event review keeps queue and opens correct event',async({page},info)=>{
 await start(page,{scene:'home',scenario:'permission'});
 const summary=page.locator('.sync-pending-context');
 const readPending=()=>page.evaluate(()=>({
  ids:JSON.parse(localStorage.getItem(__friendInviteQa.pendingKey)).__pendingSync.selection.eventIds.slice().sort(),
  acknowledgements:__friendInviteQa.canonicalWrites.length,
  savedEvents:__syncNoticePreview.sourceSaved
 }));
 const expected={ids:['friend-friday','friend-weekend'],acknowledgements:0,savedEvents:0};
 expect(await readPending()).toEqual(expected);
 await summary.locator('[data-sync-event-details] > summary').click();
 await expect(summary.locator('[data-sync-event-details]')).toHaveAttribute('open','');
 await expect(summary.locator('[data-action="open-event"]')).toHaveCount(2);
 const attempts=await page.evaluate(()=>__friendInviteQa.failedPendingAttempts.length);
 await summary.locator('[data-sync-retry]').click();
 await expect.poll(()=>page.evaluate(()=>__friendInviteQa.failedPendingAttempts.length)).toBeGreaterThan(attempts);
 await expect(summary.locator('[data-sync-retry]')).toBeEnabled();
 await expect(summary.locator('[data-sync-event-details]')).toHaveAttribute('open','');
 expect(await readPending()).toEqual(expected);
 const review=summary.locator('[data-action="open-event"][data-event-id="friend-weekend"]');
 await expect(review).toHaveAttribute('aria-label','פתיחת האירוע סוף השבוע בצפון לבדיקת העדכון הממתין');
 await review.scrollIntoViewIfNeeded();
 const hit=await review.evaluate(element=>{const rect=element.getBoundingClientRect(),target=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return{width:rect.width,height:rect.height,ownsHit:!!target&&(target===element||element.contains(target))}});
 expect(hit.width).toBeGreaterThanOrEqual(44);expect(hit.height).toBeGreaterThanOrEqual(44);expect(hit.ownsHit).toBe(true);
 await page.screenshot({path:info.outputPath('pending-event-review.png')});
 await review.click();
 await expect(page.locator('.screen h1')).toHaveText('סוף השבוע בצפון');
 expect(await readPending()).toEqual(expected);
 await info.attach('pending-review-contract',{body:JSON.stringify({before:expected,after:await readPending(),hit}),contentType:'application/json'});
});

for(const target of ['disclosure','event'])test('sync feedback preserves '+target+' pointer activation during a fresh failure receipt',async({page},info)=>{
 await start(page,{scene:'home',scenario:'permission'});
 const details=page.locator('[data-sync-event-details]');
 if(target==='event'){await details.locator(':scope > summary').click();await expect(details).toHaveAttribute('open','');}
 const selector=target==='disclosure'?'[data-sync-event-details] > summary':'[data-sync-event-details] [data-action="open-event"][data-event-id="friend-weekend"]';
 const readQueue=()=>page.evaluate(()=>({pending:localStorage.getItem(__friendInviteQa.pendingKey),acks:__friendInviteQa.canonicalWrites.length,saved:__syncNoticePreview.sourceSaved}));
 const before=await readQueue();
 await page.evaluate(async selector=>{
  const {renderPendingSyncSummary}=await import('/src/ui/syncNoticePresentation.mjs');
  const notice=document.querySelector('[data-sync-account-summary]');
  const message=JSON.parse(notice.dataset.syncSummaryKey)[1];
  const options={pendingEventIds:['friend-weekend','friend-friday'],failureDetails:{failureKind:'permission',eventFailures:[{id:'friend-weekend',failureKind:'permission'}]}};
  renderPendingSyncSummary(notice,message,options);
  window.__pendingReceiptPress={received:0,sameControl:null};
  document.addEventListener('pointerdown',function receive(event){
   const control=event.target.closest?.(selector);
   if(!control)return;
   document.removeEventListener('pointerdown',receive,true);
   __pendingReceiptPress.received++;
   renderPendingSyncSummary(notice,message,{...options,failureDetails:{failureKind:'permission',eventFailures:[...options.failureDetails.eventFailures,{id:'friend-friday',failureKind:'rejected'}]}});
   __pendingReceiptPress.sameControl=control.isConnected&&document.querySelector(selector)===control;
  },true);
 },selector);
 await page.locator(selector).click();
 expect(await page.evaluate(()=>__pendingReceiptPress)).toEqual({received:1,sameControl:true});
 if(target==='disclosure')await expect(details).toHaveAttribute('open','');
 else await expect(page.locator('.screen h1')).toHaveText('סוף השבוע בצפון');
 expect(await readQueue()).toEqual(before);
 await info.attach('pending-receipt-pointer',{body:JSON.stringify({target,queueUnchanged:true,canonicalAcknowledgements:before.acks}),contentType:'application/json'});
});

test('sync feedback preserves system32 app20 system32 text and the error',async({page})=>{await page.addInitScript(installSyntheticSystemText);const ctx=await start(page,{root:0,height:390});ctx.root=32;await geometry(ctx);const entry=page.locator('.event-share-modal [data-open-accessibility]');for(const[value,root]of[['extra-large',20],['system',32]]){await entry.click();await page.locator('.accessibility-segmented-control label:has(input[value="'+value+'"])').click();await page.keyboard.press('Escape');await expect(entry).toBeFocused();ctx.root=root;await geometry(ctx)}});
