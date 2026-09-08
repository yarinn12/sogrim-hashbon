# Visual UX regressions — 8 September 2026

Scope: the participant page reported by the user, large text, navigation, event creation, long titles, portrait/landscape, and adjacent home/profile/settings/expense flows. All fixtures are synthetic; no production group or account was modified.

## Findings and fixes

1. Header accessibility/back icon buttons inherited a text-button minimum height. At a 32px root font they grew to 91.1875px. Scope an explicit 48×48 target to icon-only modal header controls; text-bearing controls continue to grow.
2. Large-text navigation reserved 160px for roughly 38px of labels/icons. Give the bar an 82px minimum and allow content-driven growth, with 64px navigation targets. Align routed participant and expense screens to the same navigation reservation. The broad journey test detected the remaining 56px expense gap before the shared reservation was corrected.
3. Four narrow event-creation columns broke Hebrew words across disconnected lines. At large text on phone widths use two columns, preserving complete labels and all four steps.
4. In a 667×375 landscape window, a long event title consumed the participant route's fixed-height viewport while overflow was hidden. Scroll the roster title together with the list in every viewport; other participant routes also use whole-route scrolling in short windows. Remove the redundant internal navigation reservation, which could move the last row behind the header in Chromium. Preserve the complete event title.

## Regression evidence

- Header/nav tests before fixes: four expected failures across Android Chromium and iPhone WebKit (`work/visual-ux-before.log`); 91.1875px icon height and 160px navigation height.
- Creation label test before its fix: four phone/reflow failures, with words on two text lines (`work/visual-ux-second-pass.log`). The tablet already fitted its four columns.
- First three regressions after fixes: 15/15 passed across all five profiles (`work/visual-ux-after.log`).
- Permanent long-title test before its fix: four expected failures, 56px unused route gap in portrait and `overflow-y: hidden` in landscape (`work/visual-ux-roster-before-corrected-fixture.log`). The initial fixture selected a hidden duplicate navigation; corrected it to measure the visible bar, retaining both the overlap and empty-gap assertions. Chromium wheel input also independently reproduced the original inaccessible content.
- Broad intermediate audit: 205 passed, 19 profile-specific skips, one actual expense-gap failure (`work/visual-ux-broad.log`). The failure is retained as evidence and the shared reservation is corrected; final verification below supersedes this intermediate run.
- The prior static unit assertion prescribed the faulty 5rem navigation minimum. It now checks the content-sized policy while the behavioral browser test checks actual label bounds, bar spacing, hit targets and navigation results. No behavioral assertion was relaxed.

- The narrow 320px reflow profile exposed a 658px header leaving only a 46px scrolling body. The final architecture scrolls the complete roster at every width; the test checks that scroll owner and still requires the last row and add action to receive unforced clicks.
- Under simultaneous native compilation, an extra test navigation interrupted initial service-worker installation in WebKit. The three large-text tests now await the actual service-worker readiness before their second navigation; browser-error assertions remain unchanged.

- The final roster test was rerun against the original main-branch layout modules served only inside an isolated browser context: all six Android/WebKit/320px portrait-and-landscape cases failed on `overflow-y: hidden` (`work/visual-ux-final-baseline.log`). No working-tree application file or production data was reverted.

## Final validation

- Final focused browser run: **35 passed, zero failed or skipped** (`work/visual-ux-complete.log`). Covers all five profiles, the four fixes, existing quiet participant status, and the full core journey including expense entry.
- Final unit/integration suite: **2,870 passed, zero failed or skipped** (`work/visual-ux-final-unit-verified.log`).
- Native Android release build and lint succeeded. Both signed AAB and APK are checked against all 181 packaged web assets and the existing signing identity.
- The complete 890-case mobile inventory, two-client synchronization and other CI lanes must pass on the exact PR revision before merge; the PR records that run. GitHub QA protects the covered paths, but the repository also has a direct Vercel Git deployment path, so this document does not claim every possible deployment path is gated.

The permanent tests run in normal `qa:mobile` and GitHub QA, including Android Chromium, iPhone WebKit, iPad WebKit, large text, and 320px reflow. The long-title test requires a genuinely user-scrollable element, checks the visible navigation gap, and opens the last participant and the add-participant screen using unforced clicks. Chromium additionally verifies actual wheel input; Playwright mobile WebKit does not implement mouse.wheel, so it verifies scroll ownership and reachable controls instead. These are browser profiles, not physical-device certification.

Audit methodology consulted the official [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md); all reported bugs are based on local code, geometry and browser reproductions.
