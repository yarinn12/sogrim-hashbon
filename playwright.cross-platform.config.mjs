import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.mjs";

// Run real user journeys in all desktop engines, including the compact Firefox
// layout. Firefox cannot emulate a mobile browser; the compact project verifies
// reflow and interaction in Firefox, not an Android or iPhone native shell.
const journeys = [
  "e2e/app-notice-presentation.spec.mjs",
  "e2e/event-share-presentation.spec.mjs",
  "e2e/event-existing-manual-participant.spec.mjs",
  "e2e/event-friends-picker.spec.mjs",
  "e2e/event-invitation-choices.spec.mjs",
  "e2e/friend-profile-presentation.spec.mjs",
  "e2e/notification-inbox-presentation.spec.mjs",
  "e2e/install-guide-presentation.spec.mjs",
  "e2e/accessibility-presentation.spec.mjs",
  "e2e/account-deletion-presentation.spec.mjs",
  "e2e/feedback-page.spec.mjs",
  "e2e/profile-account-presentation.spec.mjs",
  "e2e/referral-invitation-presentation.spec.mjs",
  "e2e/friend-requests-presentation.spec.mjs",
  "e2e/friend-invitation.spec.mjs",
  "e2e/friends-presentation.spec.mjs",
  "e2e/settlement-completion-presentation.spec.mjs",
  "e2e/closed-summary-presentation.spec.mjs",
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
  "e2e/ax-font-transition.spec.mjs",
  "e2e/paused-zero-screenshot.spec.mjs",
  "e2e/ios-qa-measurement-controls.spec.mjs",
  "e2e-parity/ios-input-trace.spec.mjs",
  "e2e/ios-qa-journey-preflight.spec.mjs",
  "e2e/expense-keyboard-footer-regression.spec.mjs",
  "e2e/ios-xl-visual-layout.spec.mjs",
  "e2e/platform-coherence-regression.spec.mjs",
  "e2e/platform-visual-reference.spec.mjs",
  "e2e/user-reference-event-layout.spec.mjs",
  "e2e/account-upgrades-ui.spec.mjs",
  "e2e/account-event-hydration.spec.mjs",
  "e2e/pinned-events.spec.mjs",
  "e2e/foreign-expense-input.spec.mjs",
  "e2e/expense-fx-presentation.spec.mjs",
  "e2e/expense-review-presentation.spec.mjs",
  "e2e/expense-attachment-routing.spec.mjs",
  "e2e/currency-country-search.spec.mjs",
  "e2e/native-updates.spec.mjs",
  "e2e/pwa-update-recovery.spec.mjs",
  "e2e/vercel-fx-csp.spec.mjs"
];
const firefoxNavigationReadiness = "e2e-parity/firefox-navigation-readiness.spec.mjs";

export default defineConfig({
  ...base,
  testDir: ".",
  outputDir: process.env.CROSS_PLATFORM_OUTPUT_DIR || "./test-results-cross-platform",
  webServer: {
    ...base.webServer,
    // Keep local server exceptions visible beside the request-id evidence.
    stderr: "inherit",
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
      testMatch: name === "desktop-firefox" ? [...journeys, firefoxNavigationReadiness] : journeys,
      use: { ...devices[device], viewport: { width: 1280, height: 900 } }
    })),
    {
      name: "compact-firefox",
      testMatch: [...journeys, "e2e-parity/typography-navigation-readiness.spec.mjs", firefoxNavigationReadiness],
      use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } }
    },
    {
      name: "cross-engine-comparison",
      testMatch: ["e2e-parity/cross-engine-parity.spec.mjs"],
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
