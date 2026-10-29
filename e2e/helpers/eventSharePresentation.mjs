import {expect} from "@playwright/test";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
async function readable(l) {
  const lines = await l.evaluate((e) => {
    const d = e.closest(".event-link-share-screen"), walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), rows = /* @__PURE__ */ new Map();
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
      const d = e.closest(".event-link-share-screen"), r = d.getBoundingClientRect();
      d.scrollTop += l2.top - d.scrollTop - r.top - (d.clientHeight - l2.h) / 2;
    }, line);
    await expect.poll(() => l.evaluate((e, l2) => {
      const d = e.closest(".event-link-share-screen"), b = d.getBoundingClientRect(), y = l2.top - d.scrollTop, hit2 = document.elementFromPoint((l2.left + l2.right) / 2, y + l2.h / 2);
      return y >= b.top - 1 && y + l2.h <= b.bottom + 1 && !!hit2 && (e === hit2 || e.contains(hit2) || hit2.matches("input") && getComputedStyle(hit2).opacity === "0" && e.closest("label")?.contains(hit2));
    }, line)).toBe(true);
  }
}





const specs=[['.event-modal-header h2',1.5],['#event-modal-description',.8125],['.event-share-link-status.is-ready strong',.875],['.event-share-link-status:not(.is-ready) strong',.9375],['.event-share-link-status small',.875],['.event-invite-link-actions button',.9375],['.event-invite-retry-button',.9375],['.public-invite-qr-summary > strong',.9375],['.public-invite-qr-instruction',.8125]];
async function geometry(p,root){const m=p.locator('.event-link-share-screen');const data=await m.evaluate((e,specs)=>{const fonts=[],bad=[],words=[],targets=[];const shown=n=>{const b=n.getBoundingClientRect();return b.width&&b.height&&!(n.closest('details:not([open])')&&!n.closest('summary'))};for(const[s,ratio]of specs)for(const n of e.querySelectorAll(s)){if(!shown(n))continue;fonts.push({s,ratio,font:parseFloat(getComputedStyle(n).fontSize)});const own=n.getBoundingClientRect(),walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){for(let i=0;i<text.length;i++){if(!text.textContent[i].trim())continue;const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);for(const b of range.getClientRects())if(b.width&&(b.left<Math.max(0,own.left)-1||b.right>Math.min(innerWidth,own.right)+1))bad.push({s,text:text.textContent,left:b.left,right:b.right})}if(n.matches('.event-invite-link-actions button'))for(const word of text.textContent.matchAll(/\S+/gu)){const r=document.createRange();r.setStart(text,word.index);r.setEnd(text,word.index+word[0].length);words.push({word:word[0],lines:new Set([...r.getClientRects()].filter(b=>b.width&&b.height).map(b=>Math.round(b.top))).size})}}}for(const n of e.querySelectorAll('button,summary')){if(!shown(n))continue;const b=n.getBoundingClientRect();targets.push({w:b.width,h:b.height})}const box=e.getBoundingClientRect(),nav=[...document.querySelectorAll('.product-app-nav')].find(n=>n.getClientRects().length).getBoundingClientRect();return{fonts,bad,words,targets,top:box.top,bottom:box.bottom,navTop:nav.top,overflow:document.documentElement.scrollWidth-innerWidth}},specs);expect(data.bad).toEqual([]);expect(data.overflow).toBe(0);expect(data.top).toBeGreaterThanOrEqual(0);expect(data.bottom).toBeLessThanOrEqual(data.navTop+1);for(const f of data.fonts)expect(f.font,f.s).toBe(root*f.ratio);for(const w of data.words)expect(w.lines,w.word).toBe(1);for(const t of data.targets){expect(t.w).toBeGreaterThanOrEqual(44);expect(t.h).toBeGreaterThanOrEqual(44)}for(const[s]of specs)for(const node of await m.locator(s).all()){if(await node.evaluate(n=>{const r=n.getBoundingClientRect();return !!(r.width&&r.height)&&!(n.closest('details:not([open])')&&!n.closest('summary'))}))await readable(node)}
if(await m.locator('details[open]').count()){const code=m.locator('.public-invite-qr-code');await code.scrollIntoViewIfNeeded();await expect(code).toBeInViewport({ratio:1});const q=await code.locator('svg').evaluate(e=>{const b=e.getBoundingClientRect(),v=e.viewBox.baseVal,p=e.querySelector('path').getBBox();return{w:b.width,h:b.height,size:v.width,viewHeight:v.height,left:p.x,top:p.y,right:p.x+p.width,bottom:p.y+p.height}});expect(Math.abs(q.w-q.h)).toBeLessThanOrEqual(1);expect(q.size).toBe(q.viewHeight);expect(q.left).toBeGreaterThanOrEqual(12);expect(q.top).toBeGreaterThanOrEqual(12);expect(q.right).toBeLessThanOrEqual(q.size-12);expect(q.bottom).toBeLessThanOrEqual(q.size-12)}return data;}
async function readyAssets(p){const m=p.locator('.event-link-share-screen'),input=m.locator('input[name="eventInviteUrl"]');await expect(input).toHaveAttribute('data-share-ready','true');const url=await input.inputValue(),qr=m.locator('[data-public-invite-qr]'),compact=await qr.getAttribute('data-invite-url');const links=await import(pathToFileURL(resolve('src/domain/inviteLinks.mjs')).href),asset=await import(pathToFileURL(resolve('src/domain/qrCode.mjs')).href);expect(links.parseInviteEventId(url)).toBe('friend-weekend');expect(links.parseInviteToken(url)).toBe('synthetic_event_share_token_20261029_abcdef');expect(compact).toBe(asset.compactQrInviteUrl(url));const expected=asset.createQrSvg(compact,{cellSize:3,quietZone:4}).match(/<path d="([^"]+)"/)[1];expect(await qr.locator('.public-invite-qr-code svg path').getAttribute('d')).toBe(expected);return url;}
export {geometry,readyAssets};
