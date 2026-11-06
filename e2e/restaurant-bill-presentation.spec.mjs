import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openRestaurantBill,restaurantReach,restaurantClick,restaurantState,restaurantMoney} from './helpers/restaurantBillPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/restaurantBillBootstrap.js',import.meta.url),'utf8'),records=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const r={errors:[],external:[]};records.set(page,r);page.on('pageerror',e=>r.errors.push(e.message));
 await page.route('**/*',q=>new URL(q.request().url()).hostname==='127.0.0.1'?q.continue():(r.external.push(q.request().url()),q.abort()));
 if(process.env.RESTAURANT_BASELINE)for(const[url,file]of[['**/src/app.mjs*','baseline-app.mjs'],['**/src/publicLedgerWorkspaceLayer.mjs*','baseline-ledger.mjs']])await page.route(url,q=>q.fulfill({contentType:'text/javascript',body:readFileSync(process.env.RESTAURANT_BASELINE+'/'+file,'utf8')}));
 await page.addInitScript({content:'localStorage.clear();\n'+fixture});
});
test.afterEach(async({page})=>{expect(records.get(page).errors).toEqual([]);expect(records.get(page).external).toEqual([])});

test('restaurant method text honors enlarged root size',async({page})=>{
 const d=await openRestaurantBill(page,'method',{width:320,root:32});
 await expect(d.locator('.restaurant-method-option strong').first()).toHaveCSS('font-size','36px');
});
test('restaurant dish input and placeholder honor enlarged text',async({page})=>{
 const d=await openRestaurantBill(page,'items',{width:320,root:32}),input=d.locator('[data-action="quick-item-amount"]').first();
 await expect(input).toHaveCSS('font-size','32px');expect(await input.evaluate(e=>getComputedStyle(e,'::placeholder').fontSize)).toBe('32px');
});
for(const[name,options]of[['normal',{}],['enlarged',{width:320,root:32}],['landscape',{width:568,height:360,root:32}],['system',{width:320,height:390,system:true}],['long',{width:320,root:32,long:true}]])test('restaurant four screens reflow '+name,async({page})=>{
 for(const view of['method','items','review','payer']){
  const d=await openRestaurantBill(page,view,options),before=restaurantMoney(await restaurantState(page));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(options.width||393);
  expect(await d.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
  for(const l of await d.locator('button:visible:not([disabled]),summary:visible,input:visible:not([type="checkbox"]):not([type="date"])').all())await restaurantReach(page,l);
  expect(restaurantMoney(await restaurantState(page))).toEqual(before);
 }
});
test('[regression] restaurant reach realigns after a queued scroll covers the dish description',async({page})=>{
 const d=await openRestaurantBill(page,'items',{width:320,height:390,system:true}),before=restaurantMoney(await restaurantState(page));
 const description=d.locator('.quick-item-description-details summary').nth(1);
 const wasOpen=await description.locator('..').evaluate(e=>e.open);
 await description.evaluate(async e=>{
  const modal=e.closest('.expense-modal'),nav=modal.parentElement.querySelector('[aria-label="ניווט ראשי"]');
  // Reproduce the original trace's covered position, followed by a queued
  // restoration after the helper scrolls. No product or financial state changes.
  modal.scrollTop+=e.getBoundingClientRect().top-nav.getBoundingClientRect().top-12;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const covered=modal.scrollTop;
  window.__restaurantReachRestores=0;
  modal.addEventListener('scroll',()=>{
   const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   if((hit===e||e.contains(hit))&&!window.__restaurantReachRestores){
    window.__restaurantReachRestores++;
    requestAnimationFrame(()=>modal.scrollTo({top:covered,behavior:'instant'}));
   }
  });
 });
 await restaurantClick(page,description);
 expect(await page.evaluate(()=>window.__restaurantReachRestores)).toBe(1);
 await expect(description.locator('..')).toHaveJSProperty('open',!wasOpen);
 await expect(d.locator('[data-action="quick-item-amount"][data-index="1"]')).toHaveValue('30');
 expect(restaurantMoney(await restaurantState(page))).toEqual(before);
});

test('[negative control] restaurant reach rejects a permanently covered center',async({page})=>{
 await page.setViewportSize({width:320,height:390});
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.expense-modal{height:226px;overflow:auto}button{display:block;margin:400px 30px;width:260px;height:90px}nav{position:fixed;top:226px;width:100%;height:150px}.foreign-overlay{position:fixed;inset:0;background:white;z-index:100}</style><section><div class="expense-modal"><button id="description">תיאור המנה</button></div><nav aria-label="ניווט ראשי"></nav></section><div class="foreign-overlay"></div>');
 expect(await page.evaluate(()=>({width:innerWidth,height:innerHeight}))).toEqual({width:320,height:390});
 await expect(restaurantReach(page,page.locator('#description'))).rejects.toThrow(/Timeout 8000ms exceeded/);
});

test('dish split totals, remove and progress preserve the draft',async({page})=>{
 const d=await openRestaurantBill(page,'review',{width:320,root:32}),before=restaurantMoney(await restaurantState(page));
 await expect(d.locator('.quick-split-list .amount')).toHaveText(['₪100.00','₪10.00','₪10.00']);
 await restaurantClick(page,d.locator('.restaurant-quick-progress [data-stage="items"]'));await expect(d).toHaveAttribute('data-quick-stage','items');
 await expect(d.locator('[data-action="quick-item-amount"]').first()).toHaveValue('90');await expect(d.locator('.quick-item-description-details summary').first()).toHaveText('פסטה');
 await restaurantClick(page,d.locator('[data-action="quick-item-remove"][data-index="0"]'));await expect(d.locator('.quick-item-row')).toHaveCount(1);await expect(d.locator('.quick-split-list .amount')).toHaveText(['₪10.00','₪10.00','₪10.00']);
 expect(restaurantMoney(await restaurantState(page))).toEqual(before);
});
test('equal split keeps actual selected diner totals',async({page})=>{
 const d=await openRestaurantBill(page,'review',{equal:true,width:320,root:32}),before=restaurantMoney(await restaurantState(page));
 await expect(d.locator('.quick-split-list .amount')).toHaveText(['₪40.00','₪40.00','₪40.00']);await restaurantClick(page,d.locator('.restaurant-quick-progress [data-stage="items"]'));
 const cb=d.locator('[data-action="quick-item-custom-participant"]').last();await restaurantClick(page,cb.locator('..'));await expect(cb).not.toBeChecked();await expect(d.locator('.quick-split-list .amount')).toHaveText(['₪60.00','₪60.00']);expect(restaurantMoney(await restaurantState(page))).toEqual(before);
});
test('copy and finish copies the real summary without saving',async({page})=>{
 const d=await openRestaurantBill(page,'review',{width:320,root:32}),before=restaurantMoney(await restaurantState(page));
 await restaurantClick(page,d.locator('[data-action="copy-and-finish-restaurant-calculation"]'));await expect(d).toHaveCount(0);
 const copied=await page.evaluate(()=>window.__friendInviteQa.copied);expect(copied).toHaveLength(1);expect(copied[0]).toContain('נועם לוי: ₪100.00');expect(copied[0]).toContain('סה״כ: ₪120.00');expect(restaurantMoney(await restaurantState(page))).toEqual(before);
});
test('payer survives back navigation and cancel leaves records alone',async({page})=>{
 const d=await openRestaurantBill(page,'payer',{width:320,root:32}),before=restaurantMoney(await restaurantState(page));
 const backToReview=async()=>{
  await restaurantClick(page,d.locator('[data-action="expense-step-back"]'));
  // Back paints the target before WebKit finishes popstate and opening focus.
  // Scroll only after that navigation completes; keep all real hit/size checks.
  await expect.poll(()=>page.evaluate(()=>history.state?.view?.expenseDraft?.quickStage)).toBe('review');
  await expect(d).toHaveAttribute('data-quick-stage','review');
  await expect.poll(()=>d.evaluate(e=>e===document.activeElement||e.contains(document.activeElement))).toBe(true);
 };
 await restaurantClick(page,d.locator('.restaurant-payer-field .app-choice-trigger'));
 await page.getByRole('option',{name:/דנה לוי/}).click();
 await backToReview();
 await restaurantClick(page,d.locator('.expense-modal-actions [data-stage="payer"]'));
 await expect(d.locator('.restaurant-payer-field .app-choice-trigger')).toContainText('דנה לוי');
 await backToReview();
 await restaurantClick(page,d.locator('[data-action="finish-restaurant-calculation"]'));
 await expect(d).toHaveCount(0);expect(restaurantMoney(await restaurantState(page))).toEqual(before);
});
test('save records the original two dishes and total after acknowledgement',async({page})=>{
 const d=await openRestaurantBill(page,'payer');await restaurantClick(page,d.locator('[data-action="save-quick-expenses"]'));await expect(d).toHaveCount(0);
 await expect.poll(async()=>((await restaurantState(page)).events[0].expenses||[]).length).toBe(2);
 const event=(await restaurantState(page)).events[0];expect(event.expenses.reduce((n,e)=>n+e.total,0)).toBe(12000);expect(event.expenses.map(e=>e.total)).toEqual([9000,3000]);expect(event.expenses.map(e=>e.name)).toEqual(['פסטה','שתייה משותפת']);
 await expect.poll(()=>page.evaluate(()=>window.__friendInviteQa.snapshotWrites?.length||0)).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events.find(e=>e.id==='friend-weekend')?.expenses.reduce((n,e)=>n+e.total,0))).toBe(12000);
});
