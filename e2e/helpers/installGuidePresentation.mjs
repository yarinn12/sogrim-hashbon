import { expect } from "@playwright/test";
async function stable(p) {
  await p.evaluate(() => document.fonts.ready);
  await expect.poll(() => p.evaluate(() => document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime) && a.playState === "running").length)).toBe(0);
}
async function hit(l, click = true) {
  await l.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(() => l.evaluate((e) => {
    const r = e.getBoundingClientRect(), d = e.closest(".install-app-dialog").getBoundingClientRect(), p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width >= 44 && r.height >= 44 && r.top >= d.top - 1 && r.bottom <= d.bottom + 1 && !!p && (e === p || e.contains(p));
  })).toBe(true);
  if (click) {
    const b = await l.boundingBox();
    await l.page().mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
}
async function readable(l) {
  const lines = await l.evaluate((e) => {
    const d = e.closest(".install-app-dialog"), walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), rows = /* @__PURE__ */ new Map();
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
      const d = e.closest(".install-app-dialog"), r = d.getBoundingClientRect();
      d.scrollTop += l2.top - d.scrollTop - r.top - (d.clientHeight - l2.h) / 2;
    }, line);
    await expect.poll(() => l.evaluate((e, l2) => {
      const d = e.closest(".install-app-dialog"), b = d.getBoundingClientRect(), y = l2.top - d.scrollTop, hit2 = document.elementFromPoint((l2.left + l2.right) / 2, y + l2.h / 2);
      return y >= b.top - 1 && y + l2.h <= b.bottom + 1 && !!hit2 && (e === hit2 || e.contains(hit2) || hit2.matches("input") && getComputedStyle(hit2).opacity === "0" && e.closest("label")?.contains(hit2));
    }, line)).toBe(true);
  }
}

const checks=[["h2",1.5],[".install-app-description",.875],[".install-app-steps strong",.9375],[".install-app-steps p",.875],[".install-app-steps li > span",.875],[".install-app-done",.875]];
async function geometry(page,root){
 const d=page.locator('.install-app-dialog');await expect.poll(()=>d.locator('h2').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(root*1.5);
 await expect.poll(()=>d.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=13&&r.bottom<=innerHeight-13})).toBe(true);
 const m=await d.evaluate((e,checks)=>{const box=e.getBoundingClientRect(),bad=[],fonts=[];for(const[s,ratio]of checks)for(const node of e.querySelectorAll(s)){fonts.push({s,ratio,font:parseFloat(getComputedStyle(node).fontSize)});const own=node.getBoundingClientRect(),walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())for(let i=0;i<n.length;i++){if(!n.textContent[i].trim())continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);for(const b of r.getClientRects())if(b.left<Math.max(own.left,box.left)-1||b.right>Math.min(own.right,box.right)+1)bad.push({s,left:b.left,right:b.right})}}return{top:box.top,bottom:box.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,bad,fonts}},checks);
 expect(m.top).toBeGreaterThanOrEqual(13);expect(m.bottom).toBeLessThanOrEqual(m.height-13);expect(m.overflow).toBe(0);expect(m.bad).toEqual([]);for(const f of m.fonts)expect(f.font,f.s).toBe(root*f.ratio);
 for(const[s]of checks)for(const el of await d.locator(s).all())await readable(el);for(const el of await d.locator('[data-public-close-install]').all())await hit(el,false);return m;
}
export {stable,hit,readable,geometry};
