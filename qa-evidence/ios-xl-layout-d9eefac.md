# iOS XL expense layout regression

Baseline source: `d9eefac75fb3b70dc3c6959b32fcf35a84246d00`, tree `11f73d313aba1bf498b255c883a16316bd4633a4`.

The actual iPhone 16 / iOS 26.5 accessibility capture showed the last digit of `₪120.00` on a second line. The expense day summary could shrink below the number's intrinsic width. While the software keyboard was open, the wizard scrolled its header with the field; its Back and Accessibility controls needed an independent, hittable position below the status bar. The keyboard layout animation's transform also made fixed descendants scroll with the modal in browser engines.

The patch permits the day heading and summary to reflow while keeping each amount intact. It clips the keyboard scrollport below the safe area, retains the two header controls there, and accounts for their actual bottom edge when revealing the field. Only expense step routes receive the new backdrop class. The title remains scrollable at accessibility sizes. Font scales and Native acceptance thresholds are unchanged.

## Old-source control

The final regression file was run against an isolated clean baseline checkout, with no tracked application changes. Its SHA-256 was identical in baseline and corrected checkouts: `d6728e2108090f6e80e7b60f2458841d825aa76efae49570c472703962fdd7e0`.

Both iPhone WebKit AX tests failed for the intended reasons: two glyph rows instead of one, and keyboard modal top `0` instead of at least `59`. Retained evidence is under the design checkout's `qa-evidence/baseline-final/`: `old-baseline-red.log`, `group-amount-red.png`, and `keyboard-name-red.png`.

Design checkout: `C:/Users/A/Documents/Codex/2026-05-23/new-chat/.claude/worktrees/sogrim-heshbon-audit-4a8901/work/ios-xl-layout-d9eefac-20261011`. Design commit: `95f5501e9f4ccf607e88ff01717dc624f7191c31`. Integration commit: `31514932dc8d5b8ade9b2622d1060e2a4bf107a2`, above the strengthened Native validator in `e21b5f9fc97b0ce6e4972ff0a8c4b640623b908c`.

## Corrected-source checks

On the integrated source, all 24 focused layout tests passed without retries across Chromium, Firefox, WebKit, and compact Firefox at normal, 32px, and AX 37.64706px root sizes. All 3,443 normal tests and all 38 Native validator controls passed. Logs are retained in the coordinating workspace's `outputs/ios-xl-3151493-cross.log`, `ios-xl-3151493-normal.log`, and `ios-xl-3151493-native-validator-controls.log`.

The owner also completed 31 nearby iPhone WebKit checks. One earlier Firefox readiness timeout remains separately investigated; a successful later run does not establish its cause. Initial sandbox loopback failures remain in the owner's logs.

These are local browser and validator results. Actual Native captures must be regenerated and validated against the final combined source. No physical iPhone is available; this evidence does not constitute a physical-device check or a store release.
