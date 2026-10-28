import { expect } from "@playwright/test";
async function stable(p) {
  await p.evaluate(() => document.fonts.ready);
  await expect.poll(() => p.evaluate(() => document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime) && a.playState === "running").length)).toBe(0);
}
async function hit(l, click = true) {
  await l.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(() => l.evaluate((e) => {
    const r = e.getBoundingClientRect(), d = e.closest(".accessibility-center").getBoundingClientRect(), p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width >= 44 && r.height >= 44 && r.top >= d.top - 1 && r.bottom <= d.bottom + 1 && !!p && (e === p || e.contains(p));
  })).toBe(true);
  if (click) {
    const b = await l.boundingBox();
    await l.page().mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
}
async function readable(l) {
  const lines = await l.evaluate((e) => {
    const d = e.closest(".accessibility-center"), walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), rows = /* @__PURE__ */ new Map();
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
      const d = e.closest(".accessibility-center"), r = d.getBoundingClientRect();
      d.scrollTop += l2.top - d.scrollTop - r.top - (d.clientHeight - l2.h) / 2;
    }, line);
    await expect.poll(() => l.evaluate((e, l2) => {
      const d = e.closest(".accessibility-center"), b = d.getBoundingClientRect(), y = l2.top - d.scrollTop, hit2 = document.elementFromPoint((l2.left + l2.right) / 2, y + l2.h / 2);
      return y >= b.top - 1 && y + l2.h <= b.bottom + 1 && !!hit2 && (e === hit2 || e.contains(hit2) || hit2.matches("input") && getComputedStyle(hit2).opacity === "0" && e.closest("label")?.contains(hit2));
    }, line)).toBe(true);
  }
}
const checks = [["h2", 1.5], ["#accessibility-center-description", 0.8125], ["legend", 0.9375], [".accessibility-text-size-control>p", 0.8125], [".accessibility-segmented-control span", 0.875], [".accessibility-setting-row strong", 0.9375], [".accessibility-setting-row small", 0.8125], [".accessibility-statement-link strong", 0.875], [".accessibility-done-button", 0.875], [".accessibility-reset-button", 0.8125]];
async function geometry(p, root) {
  const d = p.locator(".accessibility-center");
  await expect.poll(() => d.locator("h2").evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(root * 1.5);
  const metrics = await d.evaluate((e, checks2) => {
    const modal = e.getBoundingClientRect(), bad = [], fonts = [];
    for (const [s, ratio] of checks2) for (const el of e.querySelectorAll(s)) {
      fonts.push({ s, ratio, font: parseFloat(getComputedStyle(el).fontSize) });
      const own = el.getBoundingClientRect(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
        if (!n.textContent[i].trim()) continue;
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        for (const r of range.getClientRects()) if (r.left < Math.max(own.left, modal.left) - 1 || r.right > Math.min(own.right, modal.right) + 1) bad.push({ s, left: r.left, right: r.right });
      }
    }
    return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), top: modal.top, bottom: modal.bottom, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, bad, fonts };
  }, checks);
  expect(metrics.root).toBe(root);
  expect(metrics.top).toBeGreaterThanOrEqual(13);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.height - 13);
  expect(metrics.overflow).toBe(0);
  expect(metrics.bad).toEqual([]);
  for (const item of metrics.fonts) expect(item.font, item.s).toBe(root * item.ratio);
  for (const [s] of checks) for (const el of await d.locator(s).all()) await readable(el);
  for (const s of [".accessibility-close-button", ".accessibility-segmented-control label", ".accessibility-setting-row", ".accessibility-statement-link", ".accessibility-done-button", ".accessibility-reset-button"]) for (const el of await d.locator(s).all()) await hit(el, false);
  return metrics;
}
async function contrast(p) {
  return p.locator(".accessibility-center").evaluate((e) => {
    const luminance = (rgb2) => rgb2.map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0), rgb = (s) => s.match(/[0-9.]+/g).slice(0, 3).map(Number), results = [];
    for (const s of ["h2", "#accessibility-center-description", "legend", ".accessibility-text-size-control>p", ".accessibility-segmented-control span", ".accessibility-setting-row strong", ".accessibility-setting-row small", ".accessibility-statement-link strong", ".accessibility-done-button", ".accessibility-reset-button"]) for (const el of e.querySelectorAll(s)) {
      let parent = el, bg;
      while (parent) {
        const candidate = getComputedStyle(parent).backgroundColor;
        if (candidate !== "transparent" && candidate !== "rgba(0, 0, 0, 0)") {
          bg = candidate;
          break;
        }
        parent = parent.parentElement;
      }
      const ink = luminance(rgb(getComputedStyle(el).color)), surface = luminance(rgb(bg || "rgb(255,255,255)"));
      results.push({ s, ratio: (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05) });
    }
    return results;
  });
}
async function installSyntheticSystemText() {
  const supports = CSS.supports.bind(CSS);
  CSS.supports = (...args) => args[0] === "font" && args[1] === "-apple-system-body" ? true : supports(...args);
  const media = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    const original = media(q);
    return q.replaceAll(" ", "") !== "(any-pointer:coarse)" ? original : { matches: true, media: q, addEventListener: original.addEventListener.bind(original), removeEventListener: original.removeEventListener.bind(original), addListener: original.addListener.bind(original), removeListener: original.removeListener.bind(original) };
  };
  const insert = () => {
    const style = document.createElement("style");
    style.textContent = "#apple-system-body-size-probe{font-size:34px!important}";
    document.head.append(style);
  };
  if (document.head) insert();
  else document.addEventListener("DOMContentLoaded", insert, { once: true });
}
export {
  contrast,
  geometry,
  hit,
  installSyntheticSystemText,
  readable,
  stable
};
