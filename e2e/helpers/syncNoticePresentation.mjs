import {expect,test} from '@playwright/test';
async function finish(x){expect(x.errors).toEqual([]);expect(x.external).toEqual([]);const result=await x.p.evaluate(()=>{const q=__friendInviteQa,keys=['currency','participantIds','expenses','transfers','notes','activityLog','adminIds','createdByParticipantId'],bad=state=>state.events.some(e=>{const seed=q.seedFinancialEvents.find(s=>s.id===e.id);return !seed||keys.some(k=>JSON.stringify(e[k])!==JSON.stringify(seed[k]))});return{profile:q.profileWrites.length,friends:q.writes.length,reward:q.rewardWrites.length,copied:q.copied.length,shared:q.shared.length,windows:q.shareWindows.length,personalFinancialChanges:q.snapshotWrites.filter(w=>{const r=Array.isArray(w.body)?w.body[0]:w.body;return r.state&&bad(r.state)}).length,canonicalFinancialChanges:q.canonicalWrites.filter(bad).length,pendingFinancialChanges:q.pendingKey&&localStorage.getItem(q.pendingKey)?Number(bad(JSON.parse(localStorage.getItem(q.pendingKey)))):0,failedAttempts:q.failedPendingAttempts?.length||0,canonicalAcknowledgements:q.canonicalWrites.length,pendingPresent:Boolean(q.pendingKey&&localStorage.getItem(q.pendingKey))}});for(const k of['profile','friends','reward','copied','shared','windows','personalFinancialChanges','canonicalFinancialChanges','pendingFinancialChanges'])expect(result[k],k).toBe(0);return result;}
export async function probeReadablePass(e,options={}) {
  await document.fonts.ready;
  const probeOne = async e => {
  const probe = async (index,scroll=false) => {
  const collect=()=>{
    const host = e.closest('.event-modal,.expense-modal') || document.scrollingElement;
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const rows = new Map();
    let text;
    while (text = walker.nextNode()) for (let i = 0; i < text.length; i++) {
      if (!text.textContent[i].trim()) continue;
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      for (const rect of range.getClientRects()) if (rect.width && rect.height) {
        const top = rect.top + host.scrollTop;
        const key = Math.round(top * 10);
        const previous = rows.get(key);
        rows.set(key, { top, h: rect.height, left: Math.min(previous?.left ?? rect.left, rect.left), right: Math.max(previous?.right ?? rect.right, rect.right) });
      }
    }
    return [...rows.values()];
  };
  let lines=collect(),row=lines[index];
  if(scroll&&row){
      const host = e.closest('.event-modal,.expense-modal');
      const nav = [...document.querySelectorAll('.product-app-nav')].find(n => n.getClientRects().length)?.getBoundingClientRect();
      const bounds=host?.getBoundingClientRect();
      const top=Math.max(0,bounds?.top??0);
      const bottom=Math.min(innerHeight,bounds?.bottom??innerHeight,nav?.top??innerHeight);
      const target=(top+bottom-row.h)/2;
      if(host)host.scrollTop+=row.top-host.scrollTop-target;
      else scrollTo({top:row.top-target,behavior:'instant'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    // An asynchronous status render may have moved this element while the
    // browser scrolled. Hit-test current glyphs, never the old document point.
    if(!e.isConnected)return {text:e.textContent,lines:[],readable:false,detached:true};
    lines=collect();row=lines[index];
  }
  if(!row)return {text:e.textContent,lines,readable:false};
      const host = e.closest('.event-modal,.expense-modal');
      const nav = [...document.querySelectorAll('.product-app-nav')].find(n => n.getClientRects().length)?.getBoundingClientRect();
      const bounds = host?.getBoundingClientRect();
      const top = Math.max(0, bounds?.top ?? 0);
      const bottom = Math.min(innerHeight, bounds?.bottom ?? innerHeight, nav?.top ?? innerHeight);
      const y = row.top - (host ? host.scrollTop : scrollY);
      const hit = document.elementFromPoint((row.left + row.right) / 2, y + row.h / 2);
      return {text:e.textContent,lines,row,top,bottom,y,readable:y>=top-1&&y+row.h<=bottom+1&&!!hit&&(hit===e||e.contains(hit)),hit:hit?.outerHTML.slice(0,500)};
  };
  const initial=await probe();
  if(!e.isConnected||!initial.lines.length)return {passed:false,index:0,initial,last:initial};
  let last=initial,index;
  for(index=0;index<initial.lines.length;index++){
    last=await probe(index,true);
    // Every row is measured and hit-tested again after its own scroll.
    // A replaced element, changed text, or changed row count restarts the pass.
    if(last.text!==initial.text||last.lines.length!==initial.lines.length||!last.readable)
      return {passed:false,index,initial,last};
  }
  last=await probe();
  return {passed:e.isConnected&&last.text===initial.text&&last.lines.length===initial.lines.length,
    index,initial,last};
  };
  if(!options.selector)return probeOne(e);
  const elements=[...e.querySelectorAll(options.selector)];
  const selected=elements.slice(options.start,options.start+options.count);
  const outcomes=[];
  for(const element of selected)outcomes.push(await probeOne(element));
  return {total:elements.length,outcomes};
}
async function readable(l) {
  let outcome;
  try{
    await expect.poll(async()=>{
      outcome=await l.evaluate(probeReadablePass);
      if(!outcome.passed)return false;
      // A render may finish after the first browser evaluation resolves.
      // Verify the current glyphs once more across that async boundary.
      outcome=await l.evaluate(probeReadablePass);
      return outcome.passed;
    },{timeout:8000}).toBe(true);
  }catch(error){
    await test.info().attach('sync-readable-line-failure',{body:JSON.stringify(outcome,null,2),contentType:'application/json'});
    throw error;
  }
}
async function readableAll(container,selector){
  const initialTexts=await container.locator(selector).allTextContents();
  const total=initialTexts.length;
  const batchSize=16;
  for(let start=0;start<total;start+=batchSize){
    let batch;
    try{
      await expect.poll(async()=>{
        batch=await container.evaluate(probeReadablePass,{selector,start,count:batchSize});
        return batch.total===total&&batch.outcomes.length===Math.min(batchSize,total-start)&&
          batch.outcomes.every(outcome=>outcome.passed);
      },{timeout:8000}).toBe(true);
    }catch(error){
      await test.info().attach('sync-readable-batch-failure',{body:JSON.stringify({selector,start,total,batch},null,2),contentType:'application/json'});
      throw error;
    }
  }
  expect(await container.locator(selector).allTextContents()).toEqual(initialTexts);
}
async function geometry(x){const{p,root,scene,scenario}=x;if(scene==='share')await expect(p.locator('.invite-link-row')).toHaveCSS('margin-top','24px');const specs=scenario==='permission'?(scene==='home'?[['.sync-pending-heading',.875],['.sync-pending-explanation',.875],['.sync-pending-retry',.9375],['.sync-pending-context summary',.9375]]:[['.sync-inline-route [data-inline-sync-status]',.875],['.sync-inline-route [data-sync-retry]',.9375]]):[['.sync-inline-notice .app-toast-copy',.875]];if(scenario==='routine'){await expect(p.locator('[data-sync-status]')).not.toBeVisible();await expect(p.locator('[data-sync-account-summary]')).not.toBeVisible();return{quiet:true}}const metrics=await p.evaluate(specs=>{const rows=[],bad=[],controls=[];for(const[s,ratio]of specs)for(const n of document.querySelectorAll(s)){const box=n.getBoundingClientRect();if(!box.width||!box.height)continue;rows.push({s,ratio,font:parseFloat(getComputedStyle(n).fontSize)});const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;while(t=w.nextNode())for(let i=0;i<t.length;i++){if(!t.textContent[i].trim())continue;const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);for(const b of r.getClientRects())if(b.width&&(b.left<Math.max(box.left,0)-1||b.right>Math.min(box.right,innerWidth)+1))bad.push(s)}}for(const n of document.querySelectorAll('.sync-inline-notice button,.sync-inline-route button,.sync-pending-context button,.sync-pending-context summary')){const b=n.getBoundingClientRect();if(b.width&&b.height&&!(n.closest('details:not([open])')&&!n.closest('summary')))controls.push({w:b.width,h:b.height})}return{rows,bad,controls,overflow:document.documentElement.scrollWidth-innerWidth}},specs);expect(metrics.bad).toEqual([]);expect(metrics.overflow).toBe(0);expect(metrics.rows.length).toBeGreaterThan(0);for(const r of metrics.rows)expect(r.font,r.s).toBe(root*r.ratio);for(const c of metrics.controls){expect(c.w).toBeGreaterThanOrEqual(44);expect(c.h).toBeGreaterThanOrEqual(44)}for(const[s]of specs)for(const n of await p.locator(s).all())if(await n.isVisible())await readable(n);if(['offline','conflict'].includes(scenario)){await expect(p.locator('.sync-inline-notice')).toHaveCSS('position','static');await expect(p.locator('.sync-inline-notice .app-toast-icon')).toHaveCount(0)}return metrics;}

export {finish,readable,readableAll,geometry};
