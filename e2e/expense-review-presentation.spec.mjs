import {expect,test} from '@playwright/test';
import {openHeldRenderedHome,requireHeldHomeReadiness} from './helpers/heldHomeReadinessControl.mjs';
requireHeldHomeReadiness(test);test.use({serviceWorkers:'block'});
const owner='review-owner',eventId='review-event',notice='המטבע הוחלף; יש להזין מחדש את הסכום ואת סכומי המשלמים.';
const initial={currentParticipantId:owner,participants:[{id:owner,displayName:'ירין ישראלי',kind:'user'},{id:'review-two',displayName:'דנה לוי',kind:'guest'},{id:'review-three',displayName:'איתי כהן',kind:'guest'}],friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:'סוף שבוע בצפון',eventType:'outing',currency:'ILS',participantIds:[owner,'review-two','review-three'],adminIds:[owner],createdByParticipantId:owner,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z',expenses:[],transfers:[],notes:[],deletedNotes:[],activityLog:[]}]};
test.beforeEach(async({page,request},info)=>{const fixture=structuredClone(initial);if(info.title.includes('saved participant details')&&info.title.includes('root 32')){fixture.participants[1].displayName='דנה אלכסנדרה לוי כהן עם שם משפחה ארוך';fixture.participants[2].displayName='איתי ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 כהן';}await request.post('/api/reset');await request.put('/api/state',{data:fixture});await page.addInitScript(state=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('settle-friends-state',JSON.stringify(state));localStorage.setItem('settle-friends-current-participant',state.currentParticipantId);localStorage.setItem('settle-friends-local-profile',JSON.stringify({participantId:state.currentParticipantId,displayName:'ירין ישראלי'}));sessionStorage.setItem('settle-friends-skip-next-splash','1');},fixture);await page.route('**/v6/latest/USD',route=>{const last=Math.floor(Date.now()/1000)-3600;return route.fulfill({contentType:'application/json',body:JSON.stringify({result:'success',provider:'https://www.exchangerate-api.com',base_code:'USD',time_last_update_unix:last,time_next_update_unix:last+86400,time_eol_unix:0,rates:{USD:1,ILS:3.5}})});});await openHeldRenderedHome(page);await page.locator(`[data-action="open-event"][data-event-id="${eventId}"]`).first().click();await page.locator('[data-action="show-expense-form"]').first().click();});
async function currency(page,id){await page.locator('[data-choice-select-action="expense-source-currency"]').click();await page.locator(`.app-choice-option[data-choice-value="${id}"]`).click();}
async function review(page,amount='240',name='ארוחת ערב'){await page.locator('[data-action="expense-total"]').fill(amount);await page.locator('[data-action="expense-step-next"]').click();await page.locator('[data-action="expense-name"]').fill(name);for(let i=0;i<3;i++)await page.locator('[data-action="expense-step-next"]').click();await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state')).events[0].expenses);}
async function frame(page){return page.locator('.expense-step-modal').evaluate(m=>{const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};};return {outerScroll:m.scrollTop,hero:r(m.querySelector('h2')),actions:r(m.querySelector('.expense-modal-actions')),nav:r(document.querySelector('.event-route-primary-nav')),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};});}
for(const root of [16,20,32])test(`final review preserves its header and footer at root ${root}`,async({page})=>{
 await page.evaluate(root=>{document.documentElement.classList.add('dynamic-type-preview');document.documentElement.style.setProperty('font-size',root+'px','important');},root);await review(page,'240',root===32?'ארוחת ערב לכל המשפחה והחברים במהלך סוף השבוע בצפון':'ארוחת ערב');await page.evaluate(()=>document.fonts.ready);const m=await frame(page);expect(m.outerScroll).toBe(0);expect(m.hero.top).toBeGreaterThanOrEqual(0);expect(m.actions.bottom).toBeLessThanOrEqual(m.nav.top+1);expect(m.nav.top-m.actions.bottom).toBeLessThanOrEqual(32);expect(m.overflow).toBe(false);
 await page.locator('.expense-attachment-control').scrollIntoViewIfNeeded();const after=await frame(page);expect(after.outerScroll).toBe(0);expect(after.hero.top).toBeGreaterThanOrEqual(0);expect(after.nav.top-after.actions.bottom).toBeLessThanOrEqual(32);
 for(const selector of ['[data-action="save-expense"]','[data-action="save-expense-and-continue"]','[data-action="capture-expense-attachment"]']){const el=page.locator(selector);await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(await el.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);}
 await page.locator('[data-expense-confirmation-summary]').scrollIntoViewIfNeeded();const summary=await page.locator('[data-expense-confirmation-summary] strong').evaluate(e=>{const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const actions=e.closest('.expense-step-modal').querySelector('.expense-modal-actions').getBoundingClientRect();return {font:parseFloat(getComputedStyle(e).fontSize),fits:[...range.getClientRects()].every(g=>g.x>=r.x-1&&g.right<=r.right+1&&g.y>=r.y-1&&g.bottom<=r.bottom+1),bottom:r.bottom,actionsTop:actions.top};});expect(summary.font).toBeGreaterThanOrEqual(root*.8125);expect(summary.fits).toBe(true);expect(summary.bottom).toBeLessThanOrEqual(summary.actionsTop+1);expect((await frame(page)).outerScroll).toBe(0);
 const text=await page.locator('.expense-review-row strong').evaluateAll(nodes=>nodes.map(e=>{const b=e.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);return {font:parseFloat(getComputedStyle(e).fontSize),fits:[...r.getClientRects()].every(g=>g.x>=b.x-1&&g.right<=b.right+1&&g.y>=b.y-1&&g.bottom<=b.bottom+1)};}));for(const item of text){expect(item.font).toBeGreaterThanOrEqual(root*.875);expect(item.fits).toBe(true);}expect(await saved(page)).toHaveLength(0);
});
test('a completed currency switch loses its reminder and saves only the new event-currency values',async({page})=>{
 await currency(page,'USD');await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue('3.5');await page.locator('[data-action="expense-total"]').fill('10');await currency(page,'ILS');await expect(page.getByText(notice,{exact:true})).toBeVisible();await page.locator('[data-action="expense-total"]').fill('240');await expect(page.getByText(notice,{exact:true})).toBeHidden();await review(page);await expect(page.getByText(notice,{exact:true})).toBeHidden();await page.locator('[data-action="save-expense"]').click();await expect(page.locator('.expense-row[data-expense-id]')).toHaveCount(1);const [expense]=await saved(page);expect(expense.total).toBe(24000);expect(expense.payers).toEqual([{participantId:owner,amount:24000}]);expect(expense.fxConversion).toBeUndefined();expect(expense.sharedByParticipantIds).toHaveLength(3);
});
test('foreign review uses isolated full currency names and optional provenance without losing confirmation',async({page})=>{
 await currency(page,'USD');await expect(page.locator('[data-action="expense-fx-rate"]')).toHaveValue('3.5');await review(page,'10');const amount=page.locator('.expense-review-fx-amount');await expect(amount).toContainText('דולר אמריקאי');await expect(amount).toContainText('שקלים');await expect(amount.locator('bdi')).toHaveText(['10','₪35.00']);for(const bdi of await amount.locator('bdi').all())await expect(bdi).toHaveAttribute('dir','ltr');for(const root of [16,20,32]){await page.evaluate(root=>{document.documentElement.classList.add('dynamic-type-preview');document.documentElement.style.setProperty('font-size',root+'px','important');},root);const geometry=await amount.evaluate(e=>{const box=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return {fits:[...range.getClientRects()].every(r=>r.x>=box.x-1&&r.right<=box.right+1&&r.y>=box.y-1&&r.bottom<=box.bottom+1),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};});expect(geometry.fits).toBe(true);expect(geometry.overflow).toBe(false);const save=page.locator('[data-action="save-expense"]');expect(await save.evaluate(e=>{const b=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].every(r=>r.x>=b.x-1&&r.right<=b.right+1&&r.y>=b.y-1&&r.bottom<=b.bottom+1);})).toBe(true);} const details=page.locator('.expense-review-fx-details');await expect(details.locator('[data-expense-fx-review-source]')).toBeHidden();const link=page.locator('.expense-review-fx-credit a');await expect(link).toBeVisible();await expect(link).toHaveAttribute('href','https://www.exchangerate-api.com');await details.locator('summary').press('Enter');await expect(details.locator('[data-expense-fx-review-source]')).toContainText('עודכן');await expect(page.locator('[data-action="save-expense"]')).toHaveText('אשר סכום ושמור הוצאה');await expect(page.locator('.expense-review-fx-confirmation')).toContainText('שקלים');await page.locator('[data-action="save-expense"]').click();await expect(page.locator('.expense-row[data-expense-id]')).toHaveCount(1);const [expense]=await saved(page);expect(expense.total).toBe(3500);expect(expense.fxConversion.sourceAmountMinorUnits).toBe('1000');expect(expense.fxConversion.source).toBe('ExchangeRate-API Open Access');
});
test('attachment actions share one ordinary row and edit return preserves notes before save-and-continue',async({page})=>{
 await review(page);const buttons=page.locator('.expense-flow-review .expense-attachment-upload');await expect(buttons).toHaveCount(2);await buttons.first().scrollIntoViewIfNeeded();const a=await buttons.nth(0).boundingBox(),b=await buttons.nth(1).boundingBox();expect(Math.abs(a.y-b.y)).toBeLessThan(1);expect(a.width).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);for(const control of await buttons.all()){expect(await control.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('span')].every(span=>{const range=document.createRange();range.selectNodeContents(span);return [...range.getClientRects()].every(r=>r.x>=b.x-1&&r.right<=b.right+1&&r.y>=b.y-1&&r.bottom<=b.bottom+1);});})).toBe(true);}await page.locator('[data-action="expense-notes"]').fill('הערת בדיקה');await page.locator('[data-action="expense-step-edit"][data-step="name"]').press('Enter');await expect(page.locator('[data-action="expense-name"]')).toHaveValue('ארוחת ערב');await page.locator('.expense-progress-step-button[data-step="review"]').click();await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('הערת בדיקה');await page.locator('[data-action="save-expense-and-continue"]').click();await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','amount');const expenses=await saved(page);expect(expenses).toHaveLength(1);expect(expenses[0].notes).toBe('הערת בדיקה');expect(expenses[0].total).toBe(24000);
});


test('a newly saved expense keeps its actions menu in the viewport during row arrival',async({page})=>{
 await review(page);await page.locator('[data-action="save-expense"]').click();const row=page.locator('.expense-row[data-expense-id]');await expect(row).toHaveCount(1);
 // Hold the real arrival CSS state on the actually saved row. Re-entering the
 // class avoids depending on a sub-second timer across browser engines.
 await row.evaluate(e=>e.classList.add('circle-row-added'));
 const dots=row.locator('.expense-row-actions-menu > summary');await dots.click();await expect(row.locator('.expense-row-actions-menu')).toHaveClass(/is-viewport-positioned/);
 const panel=row.locator('.expense-row-actions-menu > div');await expect(panel).toBeVisible();
 expect(await row.evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 // Sample the final layout after finite opening motion. A first aligned frame
 // can precede the Web Animation that starts on the following frame. Require
 // no pending/running ancestor motion and keep all geometry in that same sample.
 let m;
 await expect.poll(async()=>{
  m=await panel.evaluate(e=>{
   const b=e.getBoundingClientRect(),css=getComputedStyle(e),nav=document.querySelector('.event-route-primary-nav:not([hidden]),.product-app-nav:not([hidden])').getBoundingClientRect();
   let moving=0;for(let n=e;n;n=n.parentElement)moving+=n.getAnimations({subtree:false}).filter(a=>a.pending||a.playState==='running').length;
   return {top:b.top,left:b.left,right:b.right,bottom:b.bottom,width:innerWidth,navTop:nav.top,cssTop:parseFloat(css.top),cssLeft:parseFloat(css.left),animation:getComputedStyle(e.closest('.expense-row')).animationName,moving};
  });
  return {moving:m.moving,aligned:Math.max(Math.abs(m.top-m.cssTop),Math.abs(m.left-m.cssLeft))<=1};
 }).toEqual({moving:0,aligned:true});
 expect(m.animation).toBe('none');expect(Math.abs(m.top-m.cssTop)).toBeLessThanOrEqual(1);expect(Math.abs(m.left-m.cssLeft)).toBeLessThanOrEqual(1);expect(m.left).toBeGreaterThanOrEqual(0);expect(m.right).toBeLessThanOrEqual(m.width);expect(m.top).toBeGreaterThanOrEqual(0);expect(m.bottom).toBeLessThanOrEqual(m.navTop);
 for(const button of await panel.locator('button').all()){await expect(button).toBeVisible();expect(await button.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);}
 await row.locator('[data-action="edit-expense"]').click();await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');await expect(page.locator('[data-action="expense-step-edit"][data-step="amount"]')).toContainText('₪240.00');const expenses=await saved(page);expect(expenses).toHaveLength(1);expect(expenses[0].total).toBe(24000);
});


for (const root of [16, 20, 32]) test(`saved participant details preserve exact shares and readable names at root ${root}`, async ({page}) => {
  await page.setViewportSize({width: root === 32 ? 320 : 393, height: 852});
  await page.evaluate(root => {
    document.documentElement.classList.toggle('dynamic-type-preview', root > 16);
    document.documentElement.style.setProperty('font-size', root + 'px', 'important');
  }, root);
  const amount = root === 20 ? '100' : '240';
  await review(page, amount);
  await page.locator('[data-action="save-expense"]').click();
  const row = page.locator('.expense-row[data-expense-id]');
  await expect(row).toHaveCount(1);
  await row.locator('.expense-row-main').click();
  await expect(row.locator('.expense-participant-item')).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  const rows = await row.locator('.expense-participant-item').evaluateAll(nodes => nodes.map(item => {
    const name = item.querySelector('.expense-participant-copy > strong');
    const share = item.querySelector('.expense-participant-share');
    const copy = item.querySelector('.expense-participant-copy');
    const button = item.querySelector('.expense-participant-avatar-action');
    const fits = element => {
      if (!element) return false;
      const b = element.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()].every(r => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1);
    };
    const b = button.getBoundingClientRect(), c = copy.getBoundingClientRect(), a = share?.getBoundingClientRect();
    return {name: name.textContent, font: parseFloat(getComputedStyle(name).fontSize), share: share?.textContent.trim(),
      shareDirection: share?.querySelector('bdi')?.dir, nameFits: fits(name), shareFits: fits(share), nameWidth: c.width,
      disjoint: !!a && (a.right <= c.left + 1 || a.top >= c.bottom - 1), hitWidth: b.width, hitHeight: b.height};
  }));
  // Check actual leaf text first: the old 12.5px rule must fail even before the new share renderer exists.
  for (const item of rows) {
    expect(item.font).toBeCloseTo(root * .9375, 1);
    expect(item.nameFits).toBe(true);
    expect(item.nameWidth).toBeGreaterThanOrEqual(120);
    expect(item.shareFits).toBe(true);
    expect(item.disjoint).toBe(true);
    expect(item.shareDirection).toBe('ltr');
    expect(item.hitWidth).toBeGreaterThanOrEqual(44);
    expect(item.hitHeight).toBeGreaterThanOrEqual(44);
  }
  expect(rows.map(item => item.share)).toEqual(root === 20 ? ['₪33.34', '₪33.33', '₪33.33'] : ['₪80.00', '₪80.00', '₪80.00']);
  const type = await row.evaluate(e => ({
    heading: parseFloat(getComputedStyle(e.querySelector('.expense-participants-list-title')).fontSize),
    self: parseFloat(getComputedStyle(e.querySelector('.expense-participant-you')).fontSize),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  // The shared accessibility rule raises paragraph captions to at least 1rem.
  expect(type.heading).toBeCloseTo(root === 16 ? 14 : root, 1);
  expect(type.self).toBeCloseTo(root * .75, 1);
  expect(type.overflow).toBe(false);
  const last = row.locator('.expense-participant-item').last();
  await last.evaluate(e => e.scrollIntoView({block: 'center'}));
  await expect.poll(() => last.evaluate(e => {
    const nav = document.querySelector('.event-route-primary-nav:not([hidden]),.product-app-nav:not([hidden])');
    return e.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1;
  })).toBe(true);
  const [expense] = await saved(page);
  expect(expense.total).toBe(Number(amount) * 100);
  expect(expense.payers).toEqual([{participantId: owner, amount: Number(amount) * 100}]);
  expect(expense.sharedByParticipantIds).toEqual([owner, 'review-two', 'review-three']);
  await row.locator('.expense-row-main').click();
  await row.locator('.expense-row-main').click();
  await expect(row.locator('.expense-participant-share')).toHaveCount(3);
  await row.locator('.expense-row-actions-menu > summary').click();
  await row.locator('[data-action="edit-expense"]').click();
  await expect(page.locator('[data-action="expense-total"]')).toHaveValue(Number(amount).toFixed(2));
  expect(await saved(page)).toHaveLength(1);
});


async function editOverviewScale(page,root) {
 await page.evaluate(root=>{
  const url=new URL(location.href);if(root>16)url.searchParams.set('dynamic-type-preview',String(root));history.replaceState(history.state,'',url);
  document.documentElement.classList.toggle('dynamic-type-preview',root>16);document.documentElement.style.setProperty('font-size',root+'px','important');
 },root);
 await page.evaluate(()=>document.fonts.ready);
 await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);
}
const reviewDate=page=>page.locator('.expense-flow-review .expense-review-date');
async function openSavedExpenseEditor(page,row){await row.locator('.expense-row-actions-menu > summary').click();await row.locator('[data-action="edit-expense"]').click();await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');}
for(const root of [16,20,32]){
 test(`shared expense date caption and real picker preserve ISO at root ${root}`,async({page})=>{
  await page.setViewportSize({width:root===32?320:393,height:852});await editOverviewScale(page,root);await review(page);
  const field=reviewDate(page),input=field.locator('[data-action="expense-date"]'),button=field.locator('[data-action="expense-date-picker"]');
  await input.fill('2026-10-20');await expect(field.locator('[data-expense-date-caption]')).toHaveText('20.10.2026');await expect(button).toHaveAttribute('aria-label','תאריך ההוצאה: 20.10.2026');
  await button.scrollIntoViewIfNeeded();const geometry=await button.evaluate(e=>{const b=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e.querySelector('bdi'));const footer=e.closest('.expense-step-modal').querySelector('.expense-modal-actions').getBoundingClientRect();return {width:b.width,height:b.height,bottom:b.bottom,footerTop:footer.top,font:parseFloat(getComputedStyle(e).fontSize),fits:[...range.getClientRects()].every(g=>g.left>=b.left-1&&g.right<=b.right+1),hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
  expect(geometry.font).toBeCloseTo(root*.9375,1);expect(geometry.width).toBeGreaterThanOrEqual(44);expect(geometry.height).toBeGreaterThanOrEqual(44);expect(geometry.fits).toBe(true);expect(geometry.hit).toBe(true);expect(geometry.bottom).toBeLessThanOrEqual(geometry.footerTop+1);
  await input.evaluate(e=>{window.__nativeDatePickerCalls=[];const actual=e.showPicker.bind(e);e.showPicker=function(){const active=navigator.userActivation.isActive;actual();window.__nativeDatePickerCalls.push(active);};});
  await button.press('Enter');expect(await page.evaluate(()=>window.__nativeDatePickerCalls)).toEqual([true]);await page.keyboard.press('Escape');await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');
  await input.fill('2026-10-21');await expect(field.locator('[data-expense-date-caption]')).toHaveText('21.10.2026');await expect(page.locator('#expense-modal-title')).toHaveText('הכול מוכן?');
  await page.locator('[data-action="save-expense"]').click();const [expense]=await saved(page);expect(expense.occurredOn).toBe('2026-10-21');expect(expense.total).toBe(24000);
 });
 test(`edit overview uses accurate Back destination and persists date without duplicating at root ${root}`,async({page})=>{
  await page.setViewportSize({width:root===32?320:393,height:852});await editOverviewScale(page,root);await review(page);await reviewDate(page).locator('[data-action="expense-date"]').fill('2026-10-20');await page.locator('[data-action="save-expense"]').click();
  const row=page.locator('.expense-row[data-expense-id]');await expect(row).toHaveCount(1);const [original]=await saved(page);await openSavedExpenseEditor(page,row);
  const back=page.locator('.expense-step-modal .modal-section-back-button');await expect(back).toHaveAttribute('aria-label','חזרה לאירוע');await expect(page.locator('#expense-modal-title')).toHaveText('עריכת הוצאה');
  await page.locator('[data-action="expense-notes"]').fill('טיוטה לבדיקה');await page.locator('[data-action="expense-step-edit"][data-step="name"]').click();await expect(back).toHaveAttribute('aria-label','חזרה לשלב הקודם');await back.click();await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');await expect(back).toHaveAttribute('aria-label','חזרה לאירוע');await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('טיוטה לבדיקה');
  await back.click();await expect(page.locator('.expense-step-modal')).toBeHidden();expect(await saved(page)).toEqual([original]);await openSavedExpenseEditor(page,row);await expect(page.locator('[data-action="expense-notes"]')).toHaveValue('טיוטה לבדיקה');
  await reviewDate(page).locator('[data-action="expense-date"]').fill('2026-10-22');await expect(reviewDate(page).locator('[data-expense-date-caption]')).toHaveText('22.10.2026');await page.locator('[data-action="save-expense"]').click();await expect(page.locator('.expense-step-modal')).toBeHidden();
  const expenses=await saved(page);expect(expenses).toHaveLength(1);const [edited]=expenses;expect(edited.id).toBe(original.id);expect(edited.total).toBe(original.total);expect(edited.payers).toEqual(original.payers);expect(edited.sharedByParticipantIds).toEqual(original.sharedByParticipantIds);expect(edited.occurredOn).toBe('2026-10-22');expect(edited.notes).toBe('טיוטה לבדיקה');
  // This suite intentionally uses local storage. The final cloud payload and ACK
  // are exercised separately by expense-edit-cloud.spec.mjs with a connected fixture.
  await openSavedExpenseEditor(page,row);await expect(reviewDate(page).locator('[data-action="expense-date"]')).toHaveValue('2026-10-22');await expect(reviewDate(page).locator('[data-expense-date-caption]')).toHaveText('22.10.2026');
 });
}
test('native expense date fallback remains editable when showPicker is unavailable',async({page})=>{
 await review(page);const field=reviewDate(page),input=field.locator('[data-action="expense-date"]'),button=field.locator('[data-action="expense-date-picker"]');await input.evaluate(e=>Object.defineProperty(e,'showPicker',{value:undefined,configurable:true}));await button.click();await expect(field.locator('.expense-date-control')).toHaveClass(/is-native-date-fallback/);await expect(input).toBeFocused();expect(await input.evaluate(e=>getComputedStyle(e).opacity)).toBe('1');await input.fill('');await expect(field.locator('[data-expense-date-caption]')).toHaveText('בחירת תאריך');await input.fill('2026-10-23');await expect(field.locator('[data-expense-date-caption]')).toHaveText('23.10.2026');await page.keyboard.press('Escape');await expect(page.locator('.expense-step-modal')).toHaveAttribute('data-expense-step','review');
});
