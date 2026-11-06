import {test,expect} from "@playwright/test";
import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";
import {closedSummarySeed,eventId} from "./helpers/closedSummaryFixture.mjs";
import {formatSettlementSummary} from "../src/domain/settlementSummary.mjs";

test.use({serviceWorkers:"block"});

for(const root of [16,32]) test('payment activation survives a notice render between pointer down and up root '+root, async ({page,baseURL},info) => {
 const cloud=await setup(page,baseURL,{root,w:root===32?320:393,payer:true});
 const transfer=event(cloud).transfers.find(t=>t.fromParticipantId===cloud.state().currentParticipantId);
 expect(transfer).toBeTruthy();
 const selector='.transfer-row [data-action="mark-paid"][data-transfer-id="'+transfer.id+'"]';
 await page.locator('.settlement-debt-share > summary').press('Enter');
 await page.locator('.settlement-debt-share [data-action="copy-settlement"]').click();
 await expect(page.locator('[data-action="dismiss-notice"]')).toBeVisible();
 const action=page.locator(selector);
 await action.scrollIntoViewIfNeeded();
 const point=await action.evaluate(button=>{
  const box=button.getBoundingClientRect();
  const point={x:box.x+box.width/2,y:box.y+box.height/2};
  return {...point,hit:button.contains(document.elementFromPoint(point.x,point.y))};
 });
 expect(point.hit).toBe(true);
 await page.mouse.move(point.x,point.y);
 await page.mouse.down();
 const evidence=await page.evaluate(async ({selector,point})=>{
  const before=document.querySelector(selector);
  document.dispatchEvent(new CustomEvent('settle-friends:notice',{detail:{message:'הודעת בדיקה מבוקרת בזמן לחיצה'}}));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const after=document.querySelector(selector);
  return {replaced:before!==after,beforeConnected:before.isConnected,afterConnected:after?.isConnected,
   sameHit:after?.contains(document.elementFromPoint(point.x,point.y)),transferId:after?.dataset.transferId};
 },{selector,point});
 await info.attach('payment-pointer-render-boundary',{body:JSON.stringify(evidence),contentType:'application/json'});
 expect(evidence).toEqual({replaced:true,beforeConnected:false,afterConnected:true,sameHit:true,transferId:transfer.id});
 await page.mouse.up();
 await expect.poll(()=>event(cloud).transfers.find(t=>t.id===transfer.id)?.status).toBe('paid');
 await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].transfers.find(t=>t.id===transfer.id)?.status).toBe('paid');
 expect(event(cloud).activityLog.filter(item=>item.kind==='transfer-paid'&&item.entityId===transfer.id)).toHaveLength(1);
 // A delayed compatibility click must not activate the newly displayed undo.
 const undo=page.locator('[data-action="mark-pending"][data-transfer-id="'+transfer.id+'"]');
 await undo.dispatchEvent('click',{bubbles:true,detail:1,button:0});
 await expect(page.locator('.transfer-row[data-transfer-id="'+transfer.id+'"]').first()).toHaveAttribute('data-transfer-status','paid');
 expect(event(cloud).transfers.find(t=>t.id===transfer.id)?.status).toBe('paid');
 // A fresh intentional press is still available and reaches the real write ACK.
 await undo.click();
 await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].transfers.find(t=>t.id===transfer.id)?.status).toBe('pending');
 expect(cloud.errors).toEqual([]);
});

for(const change of ['cancel','different transfer']) test('payment recovery rejects '+change+' after a render',async({page,baseURL},info)=>{
 const cloud=await setup(page,baseURL,{root:16,w:393,payer:true});
 const before=finances(cloud),transfer=event(cloud).transfers.find(t=>t.fromParticipantId===cloud.state().currentParticipantId);
 const selector='.transfer-row [data-action="mark-paid"][data-transfer-id="'+transfer.id+'"]';
 const action=page.locator(selector);await action.scrollIntoViewIfNeeded();
 const point=await action.evaluate(button=>{const b=button.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});
 await page.evaluate(()=>document.addEventListener('pointerdown',event=>{
  window.__paymentTestPointer={pointerId:event.pointerId,pointerType:event.pointerType,isPrimary:event.isPrimary};
 },{capture:true,once:true}));
 await page.mouse.move(point.x,point.y);await page.mouse.down();
 const boundary=await page.evaluate(async({selector,point,change})=>{
  const old=document.querySelector(selector);
  document.dispatchEvent(new CustomEvent('settle-friends:notice',{detail:{message:'בדיקת ביטול פעולה בזמן רענון'}}));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const current=document.querySelector(selector);
  let otherId='';
  if(change==='cancel'){
   const pointer=window.__paymentTestPointer;
   if(!pointer||!Number.isInteger(pointer.pointerId))throw new Error('Original pointer identity was not captured');
   document.dispatchEvent(new PointerEvent('pointercancel',{...pointer,button:0,bubbles:true}));
  }
  else{
   const other=[...document.querySelectorAll('.transfer-row [data-action="mark-paid"]')].find(button=>button.dataset.transferId!==current.dataset.transferId);
   if(!other)throw new Error('A second transfer is required for the wrong-target control');
   otherId=other.dataset.transferId;
   other.style.cssText=`inset:auto!important;position:fixed!important;left:${point.x-22}px!important;top:${point.y-22}px!important;margin:0!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;z-index:99999!important;transform:none!important`;
  }
  return {replaced:old!==current,otherId,hit:document.elementFromPoint(point.x,point.y)?.closest('[data-action]')?.dataset.transferId};
 },{selector,point,change});
 await info.attach('cancelled-payment-pointer',{body:JSON.stringify(boundary),contentType:'application/json'});
 expect(boundary.replaced).toBe(true);
 if(change==='different transfer')expect(boundary.hit).toBe(boundary.otherId);
 await page.mouse.up();
 await expect(page.locator('.transfer-row[data-transfer-status="paid"]')).toHaveCount(0);
 expect(finances(cloud)).toEqual(before);expect(cloud.errors).toEqual([]);
});
const event=cloud=>cloud.state().events[0];
const finances=cloud=>{const e=event(cloud);return {expenses:e.expenses,transfers:e.transfers,locked:e.locked}};
async function setup(page,baseURL,c={}) {
 await page.setViewportSize({width:c.w||393,height:c.h||852});
 await page.addInitScript(root=>{
  if(root>16){const url=new URL(location.href);url.searchParams.set("dynamic-type-preview",String(root));history.replaceState(history.state,"",url);}
  window.__debtCopies=[];window.__debtUrls=[];
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__debtCopies.push(String(text))}}});
  window.open=url=>{window.__debtUrls.push(String(url));return null};
 },c.root||16);
 const cloud=await personalPinsCloud(page,baseURL,closedSummarySeed(c),{accountId:"closed-summary-owner",profileUpdatedAt:"2026-09-03T08:00:00.000Z"});
 await openSummary(page);
 if(!c.locked){
  await page.locator(".settlement-close-primary").click();await page.locator('[data-action="confirm-close-event"]').click();
  await expect.poll(()=>event(cloud).locked).toBe(true);
  await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].locked).toBe(true);
 }
 await dismiss(page);await page.evaluate(()=>document.fonts.ready);
 return cloud;
}
async function openSummary(page){
 await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();
 await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
}
async function dismiss(page){
 // Fixture cleanup, not a dismissal-action test: a toast may expire between
 // separate visibility and click calls. Resolve and dismiss atomically, then
 // verify the resulting hidden state without catching or ignoring an error.
 await page.locator('[data-action="dismiss-notice"]').evaluateAll(buttons=>buttons.forEach(button=>button.click()));
 await expect(page.getByRole("button",{name:"סגירת ההודעה",exact:true})).toBeHidden();
}
async function toggle(details){
 // Locator.press focuses the current node and scrolls it into view. A separate
 // scroll operation can hold a detached handle across a background render.
 const s=details.locator(":scope > summary");await s.press("Enter");
}
async function canonical(cloud){
 const state=cloud.state(),e=state.events[0];
 return formatSettlementSummary({eventName:e.name,participants:state.participants.filter(p=>e.participantIds.includes(p.id)),transfers:e.transfers,currency:e.currency,participantAliases:e.participantAliases,directSettlementTransfers:e.directSettlementTransfers===true});
}
async function shareChecks(page,cloud){
 const before=finances(cloud),pending=event(cloud).transfers.filter(t=>t.status!=="paid");
 const share=page.locator(".settlement-debt-share"),view=page.locator(".settlement-debt-preview"),message=view.locator(".settlement-share-message");
 await expect(share).toHaveCount(1);await expect(view).toHaveCount(1);await expect(page.locator(".settlement-list-actions")).toHaveCount(0);
 await expect(share.locator(":scope > summary")).toHaveText(pending.length?"שתף חובות":"שתף סיכום");
 await expect(view.locator(":scope > summary")).toHaveText(pending.length?"הצג חובות":"הצג סיכום");
 await expect(message).toBeHidden();await expect(share.locator(".settlement-debt-share-options")).toBeHidden();
 const copies=await page.evaluate(()=>window.__debtCopies.length),urls=await page.evaluate(()=>window.__debtUrls.length);
 await toggle(view);await expect(message).toBeVisible();await expect(share.locator(".settlement-debt-share-options")).toBeHidden();
 const summary=await canonical(cloud),lines=summary.split("\n").filter(x=>x.startsWith("• "));
 await expect(message.locator(".settlement-share-message-line")).toHaveText(lines.length?lines:[summary.split("\n").at(-1)]);
 expect(await page.evaluate(()=>window.__debtCopies.length)).toBe(copies);expect(await page.evaluate(()=>window.__debtUrls.length)).toBe(urls);
 const currency=await message.locator(".settlement-share-currency").evaluateAll(xs=>xs.map(x=>{
  const range=document.createRange();range.selectNodeContents(x);const rs=[...range.getClientRects()].filter(r=>r.width&&r.height),p=x.closest(".settlement-share-message").getBoundingClientRect();
  return {oneLine:Math.max(...rs.map(r=>r.top))-Math.min(...rs.map(r=>r.top))<1,fits:rs.every(r=>r.left>=p.left-1&&r.right<=p.right+1)};
 }));
 expect(currency).toHaveLength(pending.length);expect(currency.every(x=>x.oneLine&&x.fits)).toBe(true);
 await toggle(view);await expect(message).toBeHidden();await toggle(share);await expect(message).toBeHidden();
 await share.locator('[data-action="copy-settlement"]').click();expect(await page.evaluate(()=>window.__debtCopies.at(-1))).toBe(summary);
 await dismiss(page);if(!await share.evaluate(e=>e.open))await toggle(share);
 await share.locator('[data-action="share-whatsapp"]').click();
 const url=new URL(await page.evaluate(()=>window.__debtUrls.at(-1)));expect(url.origin).toBe("https://wa.me");expect(url.searchParams.get("text")).toBe(summary);
 await dismiss(page);if(!await share.evaluate(e=>e.open))await toggle(share);
 await share.locator('[data-action="copy-event-report"]').click();
 const report=await page.evaluate(()=>window.__debtCopies.at(-1));expect(report).toContain(event(cloud).name);expect(report).toContain("ארוחת ערב");
 await dismiss(page);if(await share.evaluate(e=>e.open))await toggle(share);
 expect(finances(cloud)).toEqual(before);
}
async function geometry(page,root){
 const g=await page.evaluate(()=>{
  const e=document.querySelector('.settlement-screen[data-event-view="summary"]');
  if(!e||!e.isConnected)throw new Error('Current settlement summary is not connected');
  const problems=[],amounts=[];
  for(const x of e.querySelectorAll(".settlement-hero-amount .font-num,.settlement-featured-amount .font-num")){
   const range=document.createRange();range.selectNodeContents(x);const rs=[...range.getClientRects()].filter(r=>r.width&&r.height),p=x.closest("strong").getBoundingClientRect();
   amounts.push({font:parseFloat(getComputedStyle(x).fontSize),oneLine:rs.length===1,fits:rs.every(r=>r.left>=p.left-1&&r.right<=p.right+1),right:rs.every(r=>Math.abs(r.right-p.right)<1)});
  }
  for(const x of e.querySelectorAll("button,summary")){
   const b=x.getBoundingClientRect();if(!b.width||!b.height)continue;
   const walker=document.createTreeWalker(x,NodeFilter.SHOW_TEXT);let n;
   while(n=walker.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);
    if([...range.getClientRects()].some(r=>r.width&&r.height&&(r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1)))problems.push(n.textContent.trim());
   }
  }
  const targets=[...e.querySelectorAll(".settlement-debt-share > summary,.settlement-debt-preview > summary")].map(x=>{const r=x.getBoundingClientRect();return {w:r.width,h:r.height}});
  return {amounts,problems,targets,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
 });
 expect(g.overflow).toBe(false);expect(g.problems).toEqual([]);
 expect(g.targets).toHaveLength(2);
 for(const a of g.amounts){expect(a.font).toBe(root*1.75);expect(a.oneLine&&a.fits&&a.right).toBe(true);}
 for(const t of g.targets){expect(t.w).toBeGreaterThanOrEqual(44);expect(t.h).toBeGreaterThanOrEqual(44);}
}
test('closed summary geometry reads the current screen after a background render replaces its node',async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:20,w:411,payer:false});
 for(const transfer of event(cloud).transfers){
  await page.locator('.transfer-row [data-action="mark-paid"][data-transfer-id="'+transfer.id+'"]').click();
  await expect.poll(()=>event(cloud).transfers.find(item=>item.id===transfer.id)?.status).toBe('paid');
  await dismiss(page);
 }
 await page.getByRole('button',{name:'הישאר בסיכום',exact:true}).click();
 await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].transfers.every(transfer=>transfer.status==='paid')).toBe(true);
 await expect(page.locator('.settlement-hero-amount')).toHaveCount(0);
 const stale=await page.locator('.settlement-screen').elementHandle();
 expect(stale).toBeTruthy();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('settle-friends:notice',{detail:{message:'רענון מבוקר בזמן מדידת סיכום'}})));
 await expect.poll(()=>stale.evaluate(element=>element.isConnected)).toBe(false);
 const staleWidths=await stale.evaluate(element=>[...element.querySelectorAll('.settlement-debt-share > summary,.settlement-debt-preview > summary')].map(summary=>summary.getBoundingClientRect().width));
 expect(staleWidths).toEqual([0,0]);
 await expect(page.locator('.settlement-debt-share > summary')).toBeVisible();
 await expect(page.locator('.settlement-debt-preview > summary')).toBeVisible();
 const pageWithStaleLocator={
  locator(selector){
   expect(selector).toBe('.settlement-screen');
   return {evaluate:expression=>stale.evaluate(expression)};
  },
  evaluate:expression=>page.evaluate(expression)
 };
 await geometry(pageWithStaleLocator,20);
 expect(cloud.errors).toEqual([]);
});
test('closed summary geometry still rejects a missing or zero-width touch target',async({page,baseURL})=>{
 await setup(page,baseURL,{root:20,w:411,payer:false});
 await page.evaluate(()=>document.querySelector('.settlement-debt-preview > summary').style.setProperty('display','none','important'));
 await expect(geometry(page,20)).rejects.toThrow(/44/);
 await page.evaluate(()=>document.querySelector('.settlement-debt-preview > summary').remove());
 await expect(geometry(page,20)).rejects.toThrow(/2/);
});
for(const c of [{root:16,w:393},{root:20,w:411},{root:32,w:320}])for(const payer of [false,true]){
 test("closed debts preview, exact sharing, payment undo and reload root "+c.root+" payer="+payer,async({page,baseURL},info)=>{
  const cloud=await setup(page,baseURL,{...c,payer}),before=finances(cloud);
  expect(event(cloud).transfers).toHaveLength(2);
  expect(event(cloud).transfers.reduce((n,t)=>n+t.amount,0)).toBe(payer?16000:11000);
  await shareChecks(page,cloud);await geometry(page,c.root);
  const first=event(cloud).transfers.find(t=>t.fromParticipantId===cloud.state().currentParticipantId)||event(cloud).transfers[0],id=first.id;
  const mark=()=>page.locator('.transfer-row [data-action="mark-paid"][data-transfer-id="'+id+'"]');
  await mark().click();await expect.poll(()=>event(cloud).transfers.find(t=>t.id===id)?.status).toBe("paid");await dismiss(page);
  await shareChecks(page,cloud);await geometry(page,c.root);
  if(payer){await expect(page.locator(".settlement-hero-total.is-group-total > span")).toHaveText("נותר לתשלום בקבוצה");}
  await page.screenshot({path:info.outputPath("partial-payment.png"),animations:"disabled"});
  await page.locator('[data-action="mark-pending"][data-transfer-id="'+id+'"]').click();
  await expect.poll(()=>event(cloud).transfers.find(t=>t.id===id)?.status).toBe("pending");await dismiss(page);
  expect(event(cloud).transfers.map(({id,amount})=>({id,amount}))).toEqual(before.transfers.map(({id,amount})=>({id,amount})));
  for(const t of event(cloud).transfers){
   await page.locator('.transfer-row [data-action="mark-paid"][data-transfer-id="'+t.id+'"]').click();
   await expect.poll(()=>event(cloud).transfers.find(x=>x.id===t.id)?.status).toBe("paid");await dismiss(page);
  }
  await page.getByRole("button",{name:"הישאר בסיכום",exact:true}).click();await shareChecks(page,cloud);await geometry(page,c.root);
  await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].transfers.every(t=>t.status==="paid")).toBe(true);
  expect(event(cloud).expenses).toEqual(before.expenses);expect(!!event(cloud).archivedAt).toBe(false);
  await cloud.reload();await openSummary(page);
  expect(event(cloud).transfers.every(t=>t.status==="paid")).toBe(true);expect(event(cloud).expenses).toEqual(before.expenses);
  await expect(page.locator(".transfer-row[data-transfer-status='paid']")).toHaveCount(2);expect(cloud.errors).toEqual([]);
 });
}
test("non-manager can inspect and share existing closed debts without a reopen control or writes",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{locked:true,readonly:true,root:32,w:320});
 await expect(page.locator('[data-action="reopen-event"]')).toHaveCount(0);
 const before=finances(cloud),writes=cloud.writes.length;
 await page.locator(".settlement-debt-preview > summary").click();await expect(page.locator(".settlement-share-message")).toBeVisible();
 await page.locator(".settlement-debt-share > summary").click();await page.locator('.settlement-debt-share [data-action="copy-settlement"]').click();
 expect(finances(cloud)).toEqual(before);expect(cloud.writes).toHaveLength(writes);expect(cloud.errors).toEqual([]);
});
test("balanced closed event uses the final summary labels without a payable amount",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{locked:true,balanced:true,root:32,w:320});
 await expect(page.locator(".settlement-hero h2")).toHaveText("הכול שולם");
 await expect(page.locator(".settlement-hero-amount")).toHaveCount(0);
 await expect(page.locator(".settlement-debt-preview > summary")).toHaveText("הצג סיכום");
 const before=finances(cloud);await page.locator(".settlement-debt-preview > summary").click();
 await expect(page.locator(".settlement-share-message")).toHaveText("הכול סגור. אין העברות פתוחות.");
 expect(finances(cloud)).toEqual(before);await geometry(page,32);expect(cloud.errors).toEqual([]);
});


test("read-only feedback preserves both debt disclosures while the debt summary is unchanged",async({page,baseURL})=>{
 const cloud=await setup(page,baseURL),before=finances(cloud);
 const share=page.locator(".settlement-debt-share"),view=page.locator(".settlement-debt-preview");
 await toggle(view);await toggle(share);
 await share.locator('[data-action="copy-settlement"]').click();
 await expect(share).toHaveAttribute("open","");await expect(view).toHaveAttribute("open","");
 await dismiss(page);
 await expect(share).toHaveAttribute("open","");await expect(view).toHaveAttribute("open","");
 await share.locator('[data-action="share-whatsapp"]').click();
 await expect(share).toHaveAttribute("open","");await expect(view).toHaveAttribute("open","");
 expect(finances(cloud)).toEqual(before);expect(cloud.errors).toEqual([]);
});
