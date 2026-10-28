import {expect} from "@playwright/test";
async function readable(l) {
  const lines = await l.evaluate((e) => {
    const d = e.closest(".event-invitation-choice-screen"), walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), rows = /* @__PURE__ */ new Map();
    let n;
    while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
      if (!n.textContent[i].trim()) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      for (const b of r.getClientRects()) if (b.width && b.height) {
        const y = b.top + d.scrollTop, key = Math.round(y * 10), old = rows.get(key);
        rows.set(key, { top: y, h: b.height, left: Math.min(old?.left ?? b.left, b.left), right: Math.max(old?.right ?? b.right, b.right) });
      }
    }
    return [...rows.values()];
  });
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    await l.evaluate((e, l2) => {
      const d = e.closest(".event-invitation-choice-screen"), r = d.getBoundingClientRect();
      d.scrollTop += l2.top - d.scrollTop - r.top - (d.clientHeight - l2.h) / 2;
    }, line);
    await expect.poll(() => l.evaluate((e, l2) => {
      const d = e.closest(".event-invitation-choice-screen"), b = d.getBoundingClientRect(), y = l2.top - d.scrollTop, hit2 = document.elementFromPoint((l2.left + l2.right) / 2, y + l2.h / 2);
      return y >= b.top - 1 && y + l2.h <= b.bottom + 1 && !!hit2 && (e === hit2 || e.contains(hit2) || hit2.matches("input") && getComputedStyle(hit2).opacity === "0" && e.closest("label")?.contains(hit2));
    }, line)).toBe(true);
  }
}



async function geometry(page,root){const modal=page.locator('.event-invitation-choice-screen'),specs=[['h2',1.5],['#event-modal-description',.8125],['.event-invitation-choice-copy strong',.9375],['.event-invitation-choice-hint',.8125]],metrics=await modal.evaluate((e,specs)=>{const bad=[],fonts=[];for(const[s,ratio]of specs)for(const node of e.querySelectorAll(s)){fonts.push({s,ratio,font:parseFloat(getComputedStyle(node).fontSize)});const own=node.getBoundingClientRect(),walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())for(let i=0;i<n.length;i++){if(!n.textContent[i].trim())continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);for(const b of r.getClientRects())if(b.left<Math.max(0,own.left)-1||b.right>Math.min(innerWidth,own.right)+1)bad.push({s,text:n.textContent,left:b.left,right:b.right});}}const box=e.getBoundingClientRect(),nav=e.parentElement.querySelector('.product-app-nav')?.getBoundingClientRect();return{fonts,bad,overflow:document.documentElement.scrollWidth-innerWidth,top:box.top,bottom:box.bottom,navTop:nav?.top??innerHeight,icons:[...e.querySelectorAll('.new-event-participant-route-action')].map(row=>{const copy=row.querySelector('.event-invitation-choice-copy').getBoundingClientRect(),icon=row.querySelector('.new-event-participant-route-icon').getBoundingClientRect(),arrow=row.querySelector('.event-invitation-choice-chevron').getBoundingClientRect(),r=row.getBoundingClientRect();return{width:r.width,height:r.height,iconDelta:Math.abs(icon.top+icon.height/2-copy.top-copy.height/2),arrowDelta:Math.abs(arrow.top+arrow.height/2-copy.top-copy.height/2)}})}},specs);expect(metrics.overflow).toBe(0);expect(metrics.bad).toEqual([]);expect(metrics.top).toBeGreaterThanOrEqual(0);expect(metrics.bottom).toBeLessThanOrEqual(metrics.navTop+1);for(const f of metrics.fonts)expect(f.font,f.s).toBe(root*f.ratio);for(const row of metrics.icons){expect(row.width).toBeGreaterThanOrEqual(44);expect(row.height).toBeGreaterThanOrEqual(44);expect(row.iconDelta).toBeLessThanOrEqual(1);expect(row.arrowDelta).toBeLessThanOrEqual(1)}for(const[s]of specs)for(const node of await modal.locator(s).all())await readable(node);return metrics;}

export{geometry,readable};
