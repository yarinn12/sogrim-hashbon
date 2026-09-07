import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

// Each test owns two independent browser engines and identities. Keep this
// separate from the device matrix so the same pair is not run five times.
const port = Number(process.env.PW_SYNC_QA_PORT || 4183);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PW_SYNC_QA_PORT must be a valid TCP port");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...base,
  testDir: "./e2e-sync",
  outputDir: "test-results-sync",
  projects: [{ name: "two-client-sync" }],
  retries: 0,
  timeout: 120_000,
  use: { ...base.use, baseURL },
  reporter: [
    [process.env.CI ? "github" : "list"],
    ["html", { open: "never", outputFolder: "playwright-report-sync" }],
    ["json", { outputFile: "test-results-sync/results.json" }]
  ],
  webServer: {
    ...base.webServer,
    command: `node server.mjs ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: {
      ...base.webServer.env,
      APP_LOCAL_STATE_FILE: ".qa-playwright-sync/app-state.json"
    }
  }
});
