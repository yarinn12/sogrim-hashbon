import { expect } from "@playwright/test";

export async function startStrictSmoothnessProbe(page) {
  await page.evaluate(() => {
    const app = document.querySelector("#app");
    const stats = {
      renderCount: 0,
      rootReplacementCount: 0,
      childListMutationCount: 0,
      mutationTargets: {},
      layoutShiftScore: 0,
      initialScrollY: window.scrollY,
      app,
      screen: app?.querySelector(":scope > .screen"),
      activeElement: document.activeElement,
      mutationObserver: null,
      layoutObserver: null,
      onRender: null
    };
    stats.onRender = () => {
      stats.renderCount += 1;
    };
    document.addEventListener("settle-friends:screen-rendered", stats.onRender);
    stats.mutationObserver = new MutationObserver((records) => {
      stats.childListMutationCount += records.length;
      stats.rootReplacementCount += records.filter(
        (record) => record.type === "childList" && record.target === app
      ).length;
      for (const record of records) {
        const element = record.target instanceof Element
          ? record.target
          : record.target.parentElement;
        const signature = element
          ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${[...element.classList].join(".")}`
          : record.target.nodeName;
        stats.mutationTargets[signature] =
          (stats.mutationTargets[signature] ?? 0) + 1;
      }
    });
    stats.mutationObserver.observe(app, { childList: true, subtree: true });
    if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes("layout-shift")) {
      stats.layoutObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) stats.layoutShiftScore += entry.value;
        }
      });
      stats.layoutObserver.observe({ type: "layout-shift", buffered: false });
    }
    globalThis.__strictSmoothnessStats = stats;
  });
}

export async function finishStrictSmoothnessProbe(page) {
  return page.evaluate(() => {
    const stats = globalThis.__strictSmoothnessStats;
    stats.mutationObserver?.disconnect();
    stats.layoutObserver?.disconnect();
    document.removeEventListener("settle-friends:screen-rendered", stats.onRender);
    return {
      renderCount: stats.renderCount,
      rootReplacementCount: stats.rootReplacementCount,
      childListMutationCount: stats.childListMutationCount,
      layoutShiftScore: stats.layoutShiftScore,
      scrollDelta: Math.abs(window.scrollY - stats.initialScrollY),
      screenPreserved: stats.screen === stats.app?.querySelector(":scope > .screen"),
      focusPreserved: stats.activeElement === document.activeElement,
      topMutationTargets: Object.entries(stats.mutationTargets)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
    };
  });
}

export function expectStrictSmoothness(result) {
  expect(result.renderCount, JSON.stringify(result)).toBe(0);
  expect(result.rootReplacementCount).toBe(0);
  expect(
    result.childListMutationCount,
    JSON.stringify(result.topMutationTargets)
  ).toBeLessThanOrEqual(2);
  expect(result.layoutShiftScore).toBeLessThanOrEqual(0.001);
  expect(result.scrollDelta).toBeLessThanOrEqual(1);
  expect(result.screenPreserved).toBe(true);
  expect(result.focusPreserved).toBe(true);
}
