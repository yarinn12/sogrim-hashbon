import { expect } from "@playwright/test";
export function bounds() {
  const top = Math.max(0, ...[...document.querySelectorAll("body *")].filter((e) => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return ["fixed", "sticky"].includes(s.position) && r.top <= 24 && r.bottom > 0 && r.bottom < innerHeight / 2 && r.width > innerWidth / 2;
  }).map((e) => e.getBoundingClientRect().bottom)), nav = document.querySelector(".product-app-nav").getBoundingClientRect();
  return { top, bottom: nav.top };
}
export async function control(locator) {
  await locator.evaluate((e, src) => {
    const band = (() => {
      const top = Math.max(0, ...[...document.querySelectorAll("body *")].filter((e2) => {
        const s = getComputedStyle(e2), r2 = e2.getBoundingClientRect();
        return ["fixed", "sticky"].includes(s.position) && r2.top <= 24 && r2.bottom > 0 && r2.bottom < innerHeight / 2 && r2.width > innerWidth / 2;
      }).map((e2) => e2.getBoundingClientRect().bottom)), nav = document.querySelector(".product-app-nav").getBoundingClientRect();
      return { top, bottom: nav.top };
    })(), r = e.getBoundingClientRect();
    scrollTo({ top: scrollY + r.y + r.height / 2 - (band.top + band.bottom) / 2, behavior: "instant" });
  }, bounds.toString());
  await expect.poll(() => locator.evaluate((e, src) => {
    const b = (() => {
      const top = Math.max(0, ...[...document.querySelectorAll("body *")].filter((e2) => {
        const s = getComputedStyle(e2), r2 = e2.getBoundingClientRect();
        return ["fixed", "sticky"].includes(s.position) && r2.top <= 24 && r2.bottom > 0 && r2.bottom < innerHeight / 2 && r2.width > innerWidth / 2;
      }).map((e2) => e2.getBoundingClientRect().bottom)), nav = document.querySelector(".product-app-nav").getBoundingClientRect();
      return { top, bottom: nav.top };
    })(), r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
    return r.width >= 44 && r.height >= 44 && y - 22 >= b.top - 1 && y + 22 <= b.bottom + 1 && !!hit && (e === hit || e.contains(hit));
  }, bounds.toString())).toBe(true);
}
export async function click(locator) {
  await control(locator);
  const point = await locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await locator.page().mouse.click(point.x, point.y);
}
export async function textLines(locator) {
  const lines = await locator.evaluate((e) => {
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), map = /* @__PURE__ */ new Map();
    let n;
    while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
      if (!n.textContent[i].trim()) continue;
      const range = document.createRange();
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      for (const r of range.getClientRects()) if (r.width && r.height) {
        const y = r.y + scrollY, key = Math.round(y * 10), old = map.get(key);
        map.set(key, { y, h: r.height, left: Math.min(old?.left ?? r.left, r.left), right: Math.max(old?.right ?? r.right, r.right) });
      }
    }
    return [...map.values()];
  });
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    await locator.evaluate((e, { line: line2, src }) => {
      const b = (() => {
        const top = Math.max(0, ...[...document.querySelectorAll("body *")].filter((e2) => {
          const s = getComputedStyle(e2), r = e2.getBoundingClientRect();
          return ["fixed", "sticky"].includes(s.position) && r.top <= 24 && r.bottom > 0 && r.bottom < innerHeight / 2 && r.width > innerWidth / 2;
        }).map((e2) => e2.getBoundingClientRect().bottom)), nav = document.querySelector(".product-app-nav").getBoundingClientRect();
        return { top, bottom: nav.top };
      })();
      scrollTo({ top: line2.y + line2.h / 2 - (b.top + b.bottom) / 2, behavior: "instant" });
    }, { line, src: bounds.toString() });
    await expect.poll(() => locator.evaluate((e, { line: line2, src }) => {
      const b = (() => {
        const top = Math.max(0, ...[...document.querySelectorAll("body *")].filter((e2) => {
          const s = getComputedStyle(e2), r = e2.getBoundingClientRect();
          return ["fixed", "sticky"].includes(s.position) && r.top <= 24 && r.bottom > 0 && r.bottom < innerHeight / 2 && r.width > innerWidth / 2;
        }).map((e2) => e2.getBoundingClientRect().bottom)), nav = document.querySelector(".product-app-nav").getBoundingClientRect();
        return { top, bottom: nav.top };
      })(), y = line2.y - scrollY, hit = document.elementFromPoint((line2.left + line2.right) / 2, y + line2.h / 2);
      return y >= b.top - 1 && y + line2.h <= b.bottom + 1 && !!hit && (e === hit || e.contains(hit));
    }, { line, src: bounds.toString() })).toBe(true);
  }
  return lines.length;
}
export async function geometry(page, root) {
  const state = await page.locator("[data-account-controls]").evaluate((a) => {
    const box = a.getBoundingClientRect(), items = [];
    for (const [selector, ratio] of [[".account-profile-controls-summary strong", 1], [".account-profile-email>span", 0.75], [".account-profile-email>bdi", 0.8125], [".account-feedback-entry-copy>strong", 0.875], [".account-feedback-entry-copy>small", 0.8125], [".account-data-link .account-row-label", 0.875], [".account-profile-actions .account-row-label", 0.875], [".account-install-button>span", 0.875], [".account-delete-button .account-row-label", 0.875], [".account-danger-note", 0.8125]]) for (const e of a.querySelectorAll(selector)) {
      if (!e.checkVisibility()) continue;
      const own = e.getBoundingClientRect(), fonts = [], bad = [], walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      let n;
      while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
        if (!n.textContent[i].trim()) continue;
        fonts.push(parseFloat(getComputedStyle(n.parentElement).fontSize));
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        for (const r of range.getClientRects()) if (r.width && r.height && (r.left < own.left - 1 || r.right > own.right + 1 || r.top < own.top - 1 || r.bottom > own.bottom + 1 || r.left < box.left + 10 || r.right > box.right - 10)) bad.push(n.textContent[i]);
      }
      items.push({ selector, text: e.textContent.trim(), ratio, font: parseFloat(getComputedStyle(e).fontSize), fonts, bad });
    }
    const groups = [...a.querySelectorAll(".account-feedback-entry,.account-data-link,.account-profile-actions>button,.account-delete-button")].map((e) => {
      const svg = e.querySelector("svg"), copy = e.querySelector(".account-row-label,.account-feedback-entry-copy,span:not([aria-hidden])");
      if (!svg || !copy) return { missingIconOrCopy: true, label: e.textContent.trim() };
      const s = svg.getBoundingClientRect(), r = e.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(copy);
      const text = range.getBoundingClientRect();
      return { label: e.textContent.trim(), cssHeight: parseFloat(getComputedStyle(e).height), cssHeightDigits: (getComputedStyle(e).height.split(".")[1] ?? "").replace("px", "").length, height: r.height, iconCount: e.querySelectorAll("svg").length, gap: s.left - text.right, center: Math.abs(s.y + s.height / 2 - text.y - text.height / 2) };
    });
    return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), width: innerWidth, scrollWidth: document.documentElement.scrollWidth, items, groups, email: a.querySelector("bdi")?.textContent ?? a.querySelector(".account-profile-email")?.textContent };
  });
  expect(state.root).toBe(root);
  expect(state.width).toBe(state.scrollWidth);
  for (const item of state.items) {
    expect(item.font, item.selector).toBeCloseTo(root * item.ratio, 3);
    expect(item.fonts.length).toBeGreaterThan(0);
    for (const f of item.fonts) expect(f, item.selector).toBeCloseTo(root * item.ratio, 3);
    expect(item.bad, item.selector + " glyph bounds").toEqual([]);
  }
  for (const group of state.groups) {
    expect(group.missingIconOrCopy).toBeUndefined();
    expect(group.cssHeight).toBeGreaterThanOrEqual(48);
    expect(Number(group.height.toFixed(group.cssHeightDigits))).toBe(group.cssHeight);
    expect(group.gap, group.label).toBeGreaterThanOrEqual(6);
    expect(group.gap, group.label).toBeLessThanOrEqual(18);
    expect(group.center, group.label).toBeLessThanOrEqual(6);
  }
  return state;
}
