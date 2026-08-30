import { defineConfig, devices } from "@playwright/test";

const port = 4193;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "android-mobile-motion",
      use: { ...devices["Pixel 5"] }
    },
    {
      name: "iphone-webkit-motion",
      use: { ...devices["iPhone 13"] }
    }
  ],
  webServer: {
    command: `node server.mjs ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      APP_LOCAL_STATE_FILE: ".qa-playwright/app-motion-state.json",
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
