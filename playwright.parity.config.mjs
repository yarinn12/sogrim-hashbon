import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.mjs";

const viewport = { width: 390, height: 844 };

export default defineConfig({
  ...base,
  outputDir: process.env.PARITY_OUTPUT_DIR || "./test-results-parity",
  projects: [
    {
      name: "android-chromium-390",
      use: { ...devices["Pixel 5"], viewport, screen: viewport, deviceScaleFactor: 1 }
    },
    {
      name: "iphone-webkit-390",
      use: { ...devices["iPhone 13"], viewport, screen: viewport, deviceScaleFactor: 1 }
    },
    ...[360, 375, 430].flatMap(width => {
      const size = { width, height: 844 };
      return [
        { name: `android-chromium-${width}`, use: { ...devices["Pixel 5"], viewport: size, screen: size, deviceScaleFactor: 1 } },
        { name: `iphone-webkit-${width}`, use: { ...devices["iPhone 13"], viewport: size, screen: size, deviceScaleFactor: 1 } }
      ];
    }),
    { name: "iphone-15-profile", use: { ...devices["iPhone 15"] } },
    { name: "iphone-16-profile", use: { ...devices["iPhone 16"] } },
    { name: "iphone-16-pro-profile", use: { ...devices["iPhone 16 Pro"] } },
    { name: "iphone-15-landscape", use: { ...devices["iPhone 15 landscape"] } },
    { name: "iphone-16-landscape", use: { ...devices["iPhone 16 landscape"] } },
    { name: "iphone-16-large-text", use: { ...devices["iPhone 16"] }, metadata: { dynamicTypePreview: 28 } },
    { name: "iphone-15-large-text", use: { ...devices["iPhone 15"], viewport, screen: viewport, deviceScaleFactor: 1 }, metadata: { dynamicTypePreview: 28 } },
    { name: "android-mobile", use: { ...devices["Pixel 5"], viewport, screen: viewport, deviceScaleFactor: 1 }, metadata: { dynamicTypePreview: 28 } }
  ]
});
