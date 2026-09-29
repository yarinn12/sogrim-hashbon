# Participant pictures without status dots — 2026-09-29

The participant status dot was generated in three shared places: the account avatar's CSS `::after`, the connection-label renderer, and the single-choice participant picker. Removed all three generators and their obsolete styling, including the smaller home-card variant and the creation-picker exception.

Connected pictures retain their color and opacity. Offline pictures retain their grayscale filter, subdued opacity and dashed border. Text descriptions, selection checks, avatar actions and their 44px touch targets remain intact. No identity, membership, settlement or synchronization logic changed.

## Regression evidence

Added a browser regression to `e2e/mobile-layout.spec.mjs`. It checks the home avatar stack, event roster and payer picker; verifies that colored and grayscale pictures remain distinct; and changes the selected payer to prove the picker still works. The existing avatar interaction test now requires no generated status content and still checks the 44px hit area and profile/statistics navigation.

Before the fix (base `91bf7d1` with only the new test), the Android-profile test failed for all three generators: a home avatar marker, three roster label dots plus an account avatar marker, and four payer-picker dots. After the fix, the same test passes.

Local validation:

- `npm test`: 3,039 passed, no failures or skips, including syntax and database integration checks.
- Focused avatar, event creation, picker and shared layout tests: 60 passed, no failures or skips.
- Three related browser scenarios across Android-profile Chromium, iPhone WebKit, iPad WebKit, iPhone large text and narrow reflow: 15 passed, no failures or skips.
- Browser screenshots confirm the roster no longer has account markers and keeps the color/grayscale distinction.

The browser checks use synthetic local data and device emulation, not physical devices or production participants. They protect the covered behavior, not every possible future change.

The web release is PWA 502. Native store binaries require a separate build and submission.
