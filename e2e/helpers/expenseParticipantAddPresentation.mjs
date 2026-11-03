import {expect} from '@playwright/test';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';
import {pointClick,paint} from './eventNotesBatchPresentation.mjs';
import {openRenderedHome} from './typographyReadiness.mjs';

export async function openExpenseAdd(page,view='menu',{width=393,height=852,root=16,system=false,query=''}={}){
 await page.setViewportSize({width,height});
 if(system)await page.addInitScript(installSyntheticSystemText);
 await openRenderedHome(page,{path:'/?review=1&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+(view==='empty'?'&picker=none':'')+query,bootTimeoutMs:30000,readyTimeoutMs:8000});
 await pointClick(page.locator('.event-list [data-action="open-event"][data-event-id="friend-weekend"]'));
 await pointClick(page.locator('[data-action="show-expense-form"][data-event-id="friend-weekend"]'));
 let d=page.locator('.expense-step-modal');
 await d.locator('[data-action="expense-total"]').fill('120');await pointClick(d.locator('[data-action="expense-step-next"]'));
 await d.locator('[data-action="expense-name"]').fill('ארוחת ערב');await pointClick(d.locator('[data-action="expense-step-next"]'));
 await pointClick(d.locator('[data-action="expense-step-next"]'));
 await pointClick(d.locator('[data-action="expense-open-participant-add"]'));
 d=page.locator('.expense-participant-add-route');
 if(view==='friends'||view==='manual')await pointClick(d.locator('[data-view="'+(view==='friends'?'friends':'offline')+'"]'));
 await paint(page);return d;
}
export const expenseAddState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')));
export const expenseAddMoney=state=>state.events.map(e=>({id:e.id,currency:e.currency,expenses:e.expenses,transfers:e.transfers}));

export async function reachExpenseAdd(page,locator){
 await locator.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
 await locator.evaluate(e=>{
  const owner=e.closest('.expense-modal'),r=e.getBoundingClientRect(),box=owner.getBoundingClientRect();
  const nav=owner.parentElement.querySelector('[aria-label="ניווט ראשי"]')?.getBoundingClientRect();
  const bottom=Math.min(box.bottom,nav?.top??innerHeight);
  if(r.top<box.top)owner.scrollTop+=r.top-box.top-4;
  else if(r.bottom>bottom)owner.scrollTop+=r.bottom-bottom+4;
  return new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
 });
 await expect.poll(()=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h===e||e.contains(h)})).toBe(true);
 const r=await locator.boundingBox();expect(r.y).toBeGreaterThanOrEqual(-1);expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);
 const nav=await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(nav.y+1);
}
export async function expenseAddGeometry(page,d,root){
 await paint(page);
 const metrics=await d.evaluate(e=>{
  const number=(el,pseudo)=>parseFloat(getComputedStyle(el,pseudo).fontSize);
  const box=e.getBoundingClientRect(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),bad=[];let n;
  while(n=walker.nextNode()){
   if(!n.textContent.trim()||n.parentElement.closest('svg,[aria-hidden="true"],.sr-only,.visually-hidden'))continue;
   const own=n.parentElement.getBoundingClientRect();if(own.width<=1&&own.height<=1)continue;
   const range=document.createRange();range.selectNodeContents(n);
   for(const r of range.getClientRects())if(r.width&&r.height&&(r.left<box.left-1||r.right>box.right+1||r.left<own.left-1||r.right>own.right+1))bad.push(n.textContent.trim());
  }
  return {root:number(document.documentElement),title:number(e.querySelector('h2')),bad,width:document.documentElement.scrollWidth,
   names:[...e.querySelectorAll('.expense-participant-choice strong,.expense-participant-friend-option strong,input')].map(n=>number(n)),
   placeholders:[...e.querySelectorAll('input')].map(n=>number(n,'::placeholder')),
   usernames:[...e.querySelectorAll('.participant-username')].map(n=>number(n))};
 });
 expect(metrics.root).toBe(root);expect(metrics.title).toBe(root*1.5);
 for(const size of [...metrics.names,...metrics.placeholders])expect(size).toBe(root);
 for(const size of metrics.usernames)expect(size).toBe(root*.875);
 expect(metrics.bad).toEqual([]);expect(metrics.width).toBeLessThanOrEqual((await page.viewportSize()).width+1);
 for(const locator of await d.locator('button:visible:not([disabled]),input:visible').all())await reachExpenseAdd(page,locator);
 return metrics;
}
