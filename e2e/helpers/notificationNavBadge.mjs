import { expect } from "@playwright/test";

// Exercise the real branding event boundary; no request or inbox record is changed.
export async function verifyNotificationNavBadge(page, onState = async () => {}) {
  const original = await page.locator("#app").getAttribute("data-notification-unread-count");
  const states = [];
  try {
    for (const count of [0, 1, 9, 10, 99, 0, 1]) {
      // The inbox may publish its canonical count while a presentation-only
      // transition is being sampled. Set, synchronously render through the real
      // screen-rendered branding boundary, and measure in one browser task.
      // Otherwise an unrelated refresh can replace the injected number before
      // the asynchronously scheduled notification event is painted.
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const state = await page.evaluate(count => {
        const app = document.querySelector("#app");
        app.dataset.notificationUnreadCount = String(count);
        document.dispatchEvent(new CustomEvent("settle-friends:notification-inbox-updated"));
        document.dispatchEvent(new CustomEvent("settle-friends:screen-rendered"));
        const element = document.querySelector('[data-nav-destination="notifications"]');
        const badge = element.querySelector(".product-nav-badge");
        const rect = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
        const style = getComputedStyle(badge);
        return { count, text:badge.textContent, position:style.position, hidden:badge.hidden,
          ariaLabel:element.getAttribute("aria-label"), publishedCount:app.dataset.notificationUnreadCount,
          nav:rect(element.closest("nav")), button:rect(element), icon:rect(element.querySelector("svg")),
          label:rect(element.querySelector(":scope > span:not(.product-nav-badge)")), badge:rect(badge),
          viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth };
      }, count);
      expect(state.publishedCount).toBe(String(count));
      expect(state.ariaLabel).toBe(count ? `התראות, ${count} חדשות` : "התראות");
      expect(state.hidden).toBe(count === 0);
      states.push(state);
      await onState(state);
      expect(state.scrollWidth).toBeLessThanOrEqual(state.viewport);
      expect(state.button.width).toBeGreaterThanOrEqual(44);
      expect(state.button.height).toBeGreaterThanOrEqual(44);
      for (const part of ["nav", "button", "icon", "label"]) {
        for (const axis of ["x", "y", "width", "height"]) {
          expect(Math.abs(state[part][axis] - states[0][part][axis]), `${part}.${axis} moved when unread became ${count}`).toBeLessThanOrEqual(0.5);
        }
      }
      if (count) {
        expect(state.text).toBe(count > 9 ? "9+" : String(count));
        expect(state.position, "the unread count must overlay the icon, never become a third grid row").toBe("absolute");
        expect(state.badge.y).toBeLessThan(state.icon.y + state.icon.height / 2);
        expect(state.badge.bottom).toBeLessThanOrEqual(state.icon.bottom + 3);
        expect(state.badge.right).toBeGreaterThan(state.icon.x);
        expect(state.badge.x).toBeLessThan(state.icon.right);
        expect(state.badge.bottom).toBeLessThanOrEqual(state.label.y);
        expect(state.badge.x).toBeGreaterThanOrEqual(state.button.x);
        expect(state.badge.right).toBeLessThanOrEqual(state.button.right);
        expect(state.badge.width).toBeGreaterThanOrEqual(17);
        expect(state.badge.height).toBeGreaterThanOrEqual(17);
      }
    }
    return states;
  } finally {
    await page.evaluate(value => {
      const app = document.querySelector("#app");
      if (value === null) delete app.dataset.notificationUnreadCount;
      else app.dataset.notificationUnreadCount = value;
      document.dispatchEvent(new CustomEvent("settle-friends:notification-inbox-updated"));
    }, original);
  }
}
