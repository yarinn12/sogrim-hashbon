import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const csp = config.routes[0].headers?.["Content-Security-Policy"];
const fixtureOrigin = "https://sogrim-csp-qa.example.test";
const rateUrl = "https://open.er-api.com/v6/latest/USD";

test("the deployed CSP lets the browser fetch FX rates", async ({ page }) => {
  expect(csp, "the fixture must use the deployed CSP header").toBeTruthy();
  let rateRequests = 0;
  await page.route(rateUrl, async route => {
    rateRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": fixtureOrigin },
      body: JSON.stringify({ result: "success", base_code: "USD", rates: { ILS: 3.5 } })
    });
  });
  await page.route(`${fixtureOrigin}/`, async route => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Content-Security-Policy": csp },
      body: "<!doctype html><html><head><title>FX CSP QA</title></head><body></body></html>"
    });
  });

  await page.goto(`${fixtureOrigin}/`);
  const response = await page.evaluate(async url => {
    const result = await fetch(url);
    return { status: result.status, body: await result.json() };
  }, rateUrl);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ result: "success", base_code: "USD" });
  expect(rateRequests, "the browser must reach the synthetic rate endpoint").toBe(1);
});
