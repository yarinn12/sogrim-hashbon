import {expect} from '@playwright/test';
import {readable} from './syncNoticePresentation.mjs';
export {finish} from './eventRoundingPresentation.mjs';
export async function geometry({page,menu,root}) {
 const specs=[['h2',1.5],['#event-modal-description',.8125],['.event-activity-copy strong',.9375],['.event-activity-copy > span',.875],['.event-activity-copy small',.8125],['.event-activity-actor',.8125],['.event-activity-copy time',.8125],['.event-activity-copy time .font-num',.8125],['.event-activity-empty',.875]];
 const m=await menu.evaluate((e,specs)=>{const fonts=[],bad=[];for(const[s,ratio]of specs)for(const n of e.querySelectorAll(s)){fonts.push({s,ratio,size:parseFloat(getComputedStyle(n).fontSize)});const box=n.getBoundingClientRect(),walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;while(t=walker.nextNode())for(let i=0;i<t.length;i++){if(!t.textContent[i].trim())continue;const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);for(const b of r.getClientRects())if(b.width&&(b.left<Math.max(0,box.left)-1||b.right>Math.min(innerWidth,box.right)+1))bad.push(s)}}return{fonts,bad,body:getComputedStyle(e.querySelector('.event-modal-body')).overflowY,document:getComputedStyle(document.documentElement).overflowY,overflow:document.documentElement.scrollWidth-innerWidth}},specs);
 expect(m.bad).toEqual([]);expect(m.overflow).toBe(0);expect(m.body).toBe('visible');expect(m.document).toBe('hidden');for(const f of m.fonts)expect(f.size,f.s).toBe(root*f.ratio);
 for(const s of['h2','#event-modal-description','.event-activity-copy strong','.event-activity-copy > span','.event-activity-copy small','.event-activity-empty'])for(const n of await menu.locator(s).all())await readable(n);
 for(const n of await menu.locator('.event-modal-header-actions button').all()){const b=await n.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44)}return m;
}
export async function settled(page){await expect.poll(()=>page.evaluate(async()=>{const m=await import('/src/data/localStore.mjs');return m.pendingSharedSyncStatus().pending})).toBe(false)}
