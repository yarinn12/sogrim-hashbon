import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openRestaurantBill} from './helpers/restaurantBillPresentation.mjs';
const fixture=readFileSync(new URL('./fixtures/restaurantBillBootstrap.js',import.meta.url),'utf8');
test.use({serviceWorkers:'block'});
for(const root of [16,32])test('restaurant keyboard preserves the visible viewport and Next at root '+root,async({page},info)=>{
 test.skip(!info.project.use.hasTouch,'software keyboard viewport applies to touch profiles');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',q=>new URL(q.request().url()).hostname==='127.0.0.1'?q.continue():q.abort());
 if(process.env.RESTAURANT_BASELINE)for(const[url,file]of[['**/src/app.mjs*','baseline-app.mjs'],['**/src/publicLedgerWorkspaceLayer.mjs*','baseline-ledger.mjs']])await page.route(url,q=>q.fulfill({contentType:'text/javascript',body:readFileSync(process.env.RESTAURANT_BASELINE+'/'+file,'utf8')}));
 if(process.env.RESTAURANT_KEYBOARD_LAYER_BASELINE)await page.route('**/src/publicMobileModalLayer.mjs*',q=>q.fulfill({contentType:'text/javascript',body:readFileSync(process.env.RESTAURANT_KEYBOARD_LAYER_BASELINE+'/publicMobileModalLayer.mjs','utf8')}));
 if(process.env.RESTAURANT_HEADER_LAYER_BASELINE)await page.route('**/src/publicLedgerWorkspaceLayer.mjs*',q=>q.fulfill({contentType:'text/javascript',body:readFileSync(process.env.RESTAURANT_HEADER_LAYER_BASELINE+'/baseline-ledger.mjs','utf8')}));
 await page.addInitScript({content:'localStorage.clear();\n'+fixture});
 await page.addInitScript(()=>{
  const viewport=new EventTarget();Object.assign(viewport,{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  window.__restaurantKeyboard=(height,offsetTop=0)=>{Object.assign(viewport,{height,offsetTop});viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'))};
 });
 const d=await openRestaurantBill(page,'items',{width:320,root}),amount=d.locator('[data-action="quick-item-amount"]').first(),offset=root===32?24:0;
 await amount.focus();await expect(amount).toBeFocused();await page.evaluate(offset=>window.__restaurantKeyboard(340,offset),offset);
 await expect(page.locator('html')).toHaveClass(/app-software-keyboard-open/);
 await expect.poll(()=>d.evaluate(e=>e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(offset+341);
 await expect.poll(()=>amount.evaluate(e=>{const r=e.getBoundingClientRect(),v=visualViewport;return r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1})).toBe(true);
 await expect(amount).toBeFocused();
 const titleBounds=await d.locator('h2').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return [...r.getClientRects()].map(x=>({left:x.left,right:x.right}))});
 for(const rect of titleBounds){expect(rect.left).toBeGreaterThanOrEqual(-1);expect(rect.right).toBeLessThanOrEqual(321)}
 const next=d.locator('.expense-modal-actions [data-stage="review"]');await next.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 await expect.poll(()=>next.evaluate(e=>{const r=e.getBoundingClientRect(),v=visualViewport,h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1&&(h===e||e.contains(h))})).toBe(true);
 await next.click();await expect(d).toHaveAttribute('data-quick-stage','review');await expect(d.locator('.quick-split-list .amount')).toHaveText(['₪100.00','₪10.00','₪10.00']);expect(errors).toEqual([]);
});
