import { defineConfig, devices } from "@playwright/test";

const port = 4182;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "android-mobile",
      use: { ...devices["Pixel 5"] }
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"] }
    },
    {
      name: "iphone-large-text",
      use: { ...devices["iPhone 13"] },
      metadata: { dynamicTypePreview: 28 }
    },
    {
      name: "reflow-200",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 800 },
        deviceScaleFactor: 1
      },
      metadata: { reflowScale: 2 }
    }
  ],
  webServer: {
    command: `node server.mjs ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      APP_LOCAL_STATE_FILE: ".qa-playwright/app-state.json",
      APP_PUBLIC_URL: " ",
      SUPABASE_URL: " ",
      SUPABASE_ANON_KEY: " ",
      SUPABASE_SERVICE_ROLE_KEY: " ",
      SUPABASE_SECRET_KEY: " ",
      GOOGLE_CLIENT_ID: " ",
      VERCEL: "",
      VERCEL_ENV: ""
    }
  }
});
