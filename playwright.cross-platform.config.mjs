import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.mjs";

// Run real user journeys in all desktop engines, including the compact Firefox
// layout. Firefox cannot emulate a mobile browser; the compact project verifies
// reflow and interaction in Firefox, not an Android or iPhone native shell.
const journeys = [
  "e2e/font-availability.spec.mjs",
  "e2e/home-responsive.spec.mjs",
  "e2e/navigation-action-inventory.spec.mjs",
  "e2e/financial-calculation-journey.spec.mjs",
  "e2e/account-auth-feedback.spec.mjs",
  "e2e/platform-compatibility.spec.mjs",
  "e2e/dialog-return-interaction.spec.mjs",
  "e2e/note-validation-focus.spec.mjs",
  "e2e/participant-roster-reflow.spec.mjs",
  "e2e/typography-engine-geometry.spec.mjs",
  "e2e/typography-spillover-regression.spec.mjs",
  "e2e/ios-qa-measurement-controls.spec.mjs",
  "e2e/platform-coherence-regression.spec.mjs"
];

export default defineConfig({
  ...base,
  testDir: ".",
  outputDir: process.env.CROSS_PLATFORM_OUTPUT_DIR || "./test-results-cross-platform",
  webServer: {
    ...base.webServer,
    env: {
      ...base.webServer.env,
      // Independent QA servers must never overwrite another run's state.
      APP_LOCAL_STATE_FILE: `.qa-cross-platform-${process.env.PW_QA_PORT || "4182"}/app-state.json`
    }
  },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-cross-platform" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report-cross-platform" }]],
  projects: [
    ...[
      ["desktop-chromium", "Desktop Chrome"],
      ["desktop-firefox", "Desktop Firefox"],
      ["desktop-webkit", "Desktop Safari"]
    ].map(([name, device]) => ({
      name,
      testMatch: journeys,
      use: { ...devices[device], viewport: { width: 1280, height: 900 } }
    })),
    {
      name: "compact-firefox",
      testMatch: journeys,
      use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } }
    },
    {
      name: "cross-engine-comparison",
      testMatch: ["e2e-parity/cross-engine-parity.spec.mjs"],
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
