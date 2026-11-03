import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openExpenseAdd,expenseAddGeometry,expenseAddState,expenseAddMoney} from './helpers/expenseParticipantAddPresentation.mjs';
import {pointClick} from './helpers/eventNotesBatchPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/eventNotesBatchBootstrap.js',import.meta.url),'utf8'),evidence=new WeakMap();
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 const r={errors:[],external:[]};evidence.set(page,r);page.on('pageerror',e=>r.errors.push(e.message));
 await page.route('**/*',q=>new URL(q.request().url()).hostname==='127.0.0.1'?q.continue():(r.external.push(q.request().url()),q.abort()));
 if(process.env.EXPENSE_ADD_BASELINE){for(const [url,file]of [['**/src/app.mjs*','baseline-app.mjs'],['**/src/publicLedgerWorkspaceLayer.mjs*','baseline-ledger.mjs']])await page.route(url,r=>r.fulfill({contentType:'text/javascript',body:readFileSync(process.env.EXPENSE_ADD_BASELINE+'/'+file,'utf8')}));}
 await page.addInitScript({content:'localStorage.clear();\n'+fixture+'\n;(()=>{const qa=globalThis.__friendInviteQa;qa.shareWindows=[];window.open=()=>({closed:false,opener:null,document:{title:""},location:{replace:url=>qa.shareWindows.push(url)},close(){this.closed=true}})})();'});
});
test.afterEach(async({page})=>{const r=evidence.get(page);expect(r.errors).toEqual([]);expect(r.external).toEqual([])});
for(const view of ['friends','manual'])test(view+' text honors requested text size',async({page})=>{
 const d=await openExpenseAdd(page,view,{width:320,root:32});
 if(view==='friends')await expect(d.locator('.expense-participant-friend-option strong').first()).toHaveCSS('font-size','32px');
 else expect(await d.locator('input').evaluate(e=>getComputedStyle(e,'::placeholder').fontSize)).toBe('32px');
});
for(const [name,options]of[['normal',{}],['large',{width:320,root:32}],['medium',{width:411,root:20}],['landscape',{width:568,height:360,root:32}],['system',{width:320,height:390,system:true}],['long',{width:320,root:32,query:'&long-names=1'}]])test('expense add screens reflow '+name,async({page})=>{
 for(const view of ['menu','friends','manual','empty']){
  const d=await openExpenseAdd(page,view,options),before=expenseAddMoney(await expenseAddState(page));
  await expenseAddGeometry(page,d,options.system?32:options.root||16);
  if(view==='empty'){
   await expect(d.locator('[data-view="friends"]')).toBeDisabled();await expect(d).toContainText('עדיין אין לך חברים באפליקציה');
   await expect(d.locator('[data-view="offline"]')).toBeEnabled();await expect(d.locator('[data-action="expense-share-invite"]')).toBeEnabled();
  }
  expect(expenseAddMoney(await expenseAddState(page))).toEqual(before);
 }
});
test('natural wheel scrolling reaches the last action in a short enlarged viewport',async({page})=>{
 const d=await openExpenseAdd(page,'menu',{width:568,height:360,root:32}),last=d.locator('[data-view="offline"]');
 const positions=[await d.evaluate(e=>({phase:'before hover',scroll:e.scrollTop,rect:e.getBoundingClientRect(),padding:getComputedStyle(e).padding}))];
 expect(positions[0].scroll,'the new view must not inherit the parent scroll offset').toBe(0);
 await expect(d).toHaveCSS('overflow-y','auto');await d.hover();positions.push(await d.evaluate(e=>({phase:'after hover',scroll:e.scrollTop})));let reached=false;
 for(let i=0;i<50;i++){
  const r=await last.boundingBox(),nav=await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).boundingBox();
  if(i<3)positions.push({iteration:i,last:r,nav});
  if(r.y>=0&&r.y+r.height<=nav.y+1){reached=true;break}
  await page.mouse.wheel(0,40);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 }
 expect(reached,JSON.stringify({positions,parents:await last.evaluate(e=>{const parents=[];for(let p=e;p&&parents.length<7;p=p.parentElement)parents.push({cls:p.className,rect:p.getBoundingClientRect(),scroll:p.scrollTop,height:p.scrollHeight,client:p.clientHeight});return parents})})).toBe(true);
 await pointClick(last);await expect(d).toHaveAttribute('data-expense-participant-add-view','offline');
});
test('scrolling to the real end never leaves an empty tail after the last action',async({page})=>{
 for(const view of ['menu','friends','manual','empty']){
  const d=await openExpenseAdd(page,view,{width:568,height:360,root:32});
  await d.evaluate(e=>{e.scrollTop=e.scrollHeight;return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  const last=d.locator(view==='friends'?'.expense-participant-friend-option':view==='manual'?'[data-action="event-add-guest"]':'.expense-participant-choice').last();
  const r=await last.boundingBox(),box=await d.boundingBox(),nav=await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).boundingBox();
  expect(r.y,'last action must remain visible at the scroll end: '+view).toBeGreaterThanOrEqual(box.y-1);
  expect(r.y+r.height).toBeLessThanOrEqual(nav.y+1);
  expect(await last.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit)})).toBe(true);
  for(const button of await d.locator('.expense-progress-step-button').all())expect(await button.getAttribute('aria-label')).toMatch(/שלב \d מתוך 5/);
 }
});
for(const view of ['friends','manual'])test('adding '+view+' selects the participant without saving an expense',async({page})=>{
 const d=await openExpenseAdd(page,view,{width:320,root:32}),before=expenseAddMoney(await expenseAddState(page));let id;
 if(view==='friends'){const button=d.locator('[data-action="expense-add-friend-participant"]').first();id=await button.getAttribute('data-participant-id');await pointClick(button)}
 else{await d.locator('input').fill('יובל ישראלי');await pointClick(d.locator('[data-action="event-add-guest"]'));await expect.poll(async()=>!!(await expenseAddState(page)).participants.find(p=>p.displayName==='יובל ישראלי')).toBe(true);id=(await expenseAddState(page)).participants.find(p=>p.displayName==='יובל ישראלי').id}
 await expect(page.locator('.expense-participant-add-route')).toHaveCount(0);
 await expect(page.locator('[data-action="expense-shared"][data-participant-id="'+id+'"]')).toBeChecked();
 expect((await expenseAddState(page)).events[0].participantIds).toContain(id);expect(expenseAddMoney(await expenseAddState(page))).toEqual(before);
});
test('tapping the friend avatar selects that friend instead of leaving the expense',async({page})=>{
 const d=await openExpenseAdd(page,'friends'),row=d.locator('[data-action="expense-add-friend-participant"]').first();
 const id=await row.getAttribute('data-participant-id'),before=expenseAddMoney(await expenseAddState(page));
 await pointClick(row.locator('.avatar'));
 await expect(page.locator('.expense-participant-add-route')).toHaveCount(0);
 await expect(page.locator('[data-action="expense-shared"][data-participant-id="'+id+'"]')).toBeChecked();
 expect(expenseAddMoney(await expenseAddState(page))).toEqual(before);
});
test('back and progress retain the expense draft',async({page})=>{
 const d=await openExpenseAdd(page),before=expenseAddMoney(await expenseAddState(page));
 await pointClick(d.locator('[data-view="offline"]'));await pointClick(d.locator('[data-action="expense-participant-add-back"]'));
 await expect(d).toHaveAttribute('data-expense-participant-add-view','menu');
 await pointClick(d.locator('[data-action="expense-progress-step"][data-step="name"]'));
 await expect(page.locator('[data-action="expense-name"]')).toHaveValue('ארוחת ערב');
 expect(expenseAddMoney(await expenseAddState(page))).toEqual(before);
});
test('share opens the existing event invitation without changing saved expenses',async({page})=>{
 const d=await openExpenseAdd(page),before=expenseAddMoney(await expenseAddState(page));
 await pointClick(d.locator('[data-action="expense-share-invite"]'));
 await expect.poll(()=>page.evaluate(()=>__friendInviteQa.shareWindows.length)).toBe(1);
 const url=await page.evaluate(()=>__friendInviteQa.shareWindows[0]);expect(decodeURIComponent(url)).toContain('סוף השבוע בצפון');expect(decodeURIComponent(url)).toMatch(/https?:/);
 expect(expenseAddMoney(await expenseAddState(page))).toEqual(before);
});
