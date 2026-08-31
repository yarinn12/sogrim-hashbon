import { expect, test } from "@playwright/test";

test("manual event joining sends one request for repeated taps", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app .screen")).toBeVisible();

  await page.evaluate(() => {
    const panel = document.createElement("section");
    panel.dataset.joinResilienceFixture = "true";
    panel.innerHTML = `
      <input data-public-join-event-link />
      <p data-public-join-event-error hidden></p>
      <button type="button" data-public-join-existing-event>הצטרף לאירוע</button>
    `;
    document.body.append(panel);

    const nativeFetch = window.fetch.bind(window);
    window.__joinRedeemCalls = 0;
    window.__releaseJoinRedeem = null;
    window.fetch = (input, init) => {
      if (String(input).includes("/api/event-invites/redeem")) {
        window.__joinRedeemCalls += 1;
        return new Promise((resolve) => {
          window.__releaseJoinRedeem = () => resolve(new Response(
            JSON.stringify({
              code: "EVENT_INVITES_UNAVAILABLE",
              retryable: true
            }),
            {
              status: 503,
              headers: { "content-type": "application/json" }
            }
          ));
        });
      }
      return nativeFetch(input, init);
    };
  });

  const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
  const panel = page.locator('[data-join-resilience-fixture="true"]');
  const button = panel.locator("[data-public-join-existing-event]");
  await panel.locator("[data-public-join-event-link]").fill(
    `https://sogrim-hesbon-app.vercel.app/i/event-join-resilience/t/${token}`
  );

  await button.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect.poll(() => page.evaluate(() => window.__joinRedeemCalls)).toBe(1);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-busy", "true");

  await page.evaluate(() => window.__releaseJoinRedeem?.());
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute("aria-busy", "true");
  await expect(panel.locator("[data-public-join-event-error]")).toContainText(
    "לא הצלחנו לפתוח את הקישור כרגע"
  );
});
