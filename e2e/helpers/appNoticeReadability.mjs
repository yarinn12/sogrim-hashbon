import {expect} from "@playwright/test";
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




export {readable};
