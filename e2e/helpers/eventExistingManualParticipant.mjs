import {expect} from "@playwright/test";
async function readable(l) {
  const lines = await l.evaluate((e) => {
    const d = e.closest(".event-manual-name-screen"), walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), rows = /* @__PURE__ */ new Map();
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
      const d = e.closest(".event-manual-name-screen"), r = d.getBoundingClientRect();
      d.scrollTop += l2.top - d.scrollTop - r.top - (d.clientHeight - l2.h) / 2;
    }, line);
    await expect.poll(() => l.evaluate((e, l2) => {
      const d = e.closest(".event-manual-name-screen"), b = d.getBoundingClientRect(), y = l2.top - d.scrollTop, hit2 = document.elementFromPoint((l2.left + l2.right) / 2, y + l2.h / 2);
      return y >= b.top - 1 && y + l2.h <= b.bottom + 1 && !!hit2 && (e === hit2 || e.contains(hit2) || hit2.matches("input") && getComputedStyle(hit2).opacity === "0" && e.closest("label")?.contains(hit2));
    }, line)).toBe(true);
  }
}





const specs=[['.event-modal-header h2',1.5],['#event-modal-description',.8125],['.event-manual-explanation',.875],['.event-participant-offline-form > label',.875],['.event-participant-offline-form > input',1],['.new-event-offline-add > .primary-button',.9375],['.new-event-offline-add > .field-error',.8125]];
async function geometry(page,root){const modal=page.locator('.event-manual-name-screen');const data=await modal.evaluate((e,specs)=>{const fonts=[],bad=[],targets=[];for(const[s,ratio]of specs)for(const n of e.querySelectorAll(s)){fonts.push({s,ratio,font:parseFloat(getComputedStyle(n).fontSize)});const own=n.getBoundingClientRect(),walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode())for(let i=0;i<text.length;i++){if(!text.textContent[i].trim())continue;const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);for(const b of range.getClientRects())if(b.width&&(b.left<Math.max(0,own.left)-1||b.right>Math.min(innerWidth,own.right)+1))bad.push({s,text:text.textContent,left:b.left,right:b.right})}}for(const el of e.querySelectorAll('input,button')){if(!el.getClientRects().length)continue;const b=el.getBoundingClientRect();targets.push({tag:el.tagName,width:b.width,height:b.height})}const b=e.getBoundingClientRect(),nav=[...document.querySelectorAll('.product-app-nav')].find(n=>n.getClientRects().length).getBoundingClientRect();return{fonts,bad,targets,top:b.top,bottom:b.bottom,navTop:nav.top,overflow:document.documentElement.scrollWidth-innerWidth}},specs);expect(data.bad).toEqual([]);expect(data.overflow).toBe(0);expect(data.top).toBeGreaterThanOrEqual(0);expect(data.bottom).toBeLessThanOrEqual(data.navTop+1);for(const f of data.fonts)expect(f.font,f.s).toBe(root*f.ratio);for(const t of data.targets){expect(t.width).toBeGreaterThanOrEqual(44);expect(t.height).toBeGreaterThanOrEqual(44)}for(const[s]of specs){if(s.includes('input'))continue;for(const node of await modal.locator(s).all())await readable(node)}const input=modal.locator('input');expect(await input.evaluate(e=>parseFloat(getComputedStyle(e,'::placeholder').fontSize))).toBe(root);await expect(input).toHaveAccessibleName('שם המשתתף');await input.scrollIntoViewIfNeeded();await expect(input).toBeInViewport({ratio:1});await expect(modal.locator('.event-participant-offline-form > label')).toHaveAttribute('for','event-offline-participant-name');return data;}
export {geometry,readable};
