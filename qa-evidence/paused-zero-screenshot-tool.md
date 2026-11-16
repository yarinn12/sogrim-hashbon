# Paused-zero screenshot fixture regression

Base source: commit `9e96d419485e9d37506da3c7089954d9bf0e826b`, tree
`53280c77a6a2c257fcb0fa1612b83f70302fff03`.

The previous parity fixture paused document animations at time zero and then
called `page.screenshot({ animations: "disabled" })`. On the actual event page,
that screenshot mode changes its infinite header shimmer from `paused` to
`running` after capture. A fixture claiming to keep the animation frozen at
zero must preserve the state it set. This finding does **not** prove that the
fixture behavior caused the separately retained 149-pixel Chromium circle-edge
discrepancy.

`e2e/helpers/pausedZeroScreenshot.mjs` freezes every animation currently
visible to `document.getAnimations()` at time zero, waits for two animation
frames, and repeats if WebKit introduces further entrance animations. It
captures with `animations: "allow"` and asserts that the complete animation
readback is unchanged afterward. The retry is confined to establishing the
pre-capture zero frame; it does not retry or accept a screenshot comparison.

`e2e/paused-zero-screenshot.spec.mjs` enters a real event screen with synthetic
local state through the regular Playwright mobile suite. It requires the
infinite `event-overview-header` animation to exist, takes a PNG through the
helper, checks the paused-zero state, and attaches the before/after readback.

## RED/GREEN evidence

- Controlled old-mode mutation: with only the helper's screenshot option set
  to `disabled`, the focused Android-profile Chromium test failed. The
  infinite `top event-overview-header::after` animation was `paused` at time 0
  before capture and `running` at time 0 afterward. The final-helper mutation
  and failure are retained in
  `../../../outputs/paused-zero-tool-test-20261011/final-red.log`.
- Final helper: restoring `animations: "allow"` passed the focused regression
  and the nearby empty-event UI case in all five normal mobile Playwright
  projects: 10/10. Log:
  `../../../outputs/paused-zero-tool-test-20261011/final-mobile.log`.
- `npm test`: 3,403 passed, 0 failed, 0 skipped, with local loopback and
  temporary-file permissions. Log:
  `../../../outputs/paused-zero-tool-test-20261011/npm-test-escalated.log`.
  An earlier sandboxed run failed on loopback `EACCES` and temporary-file
  `EPERM`; that environmental failure is retained in
  `../../../outputs/paused-zero-tool-test-20261011/npm-test.log`.

These are local browser and synthetic-state checks. They do not test a physical
iPhone, a Native bridge, the published site, or the provenance of generated
`www` bytes. No product source, CSS, screenshot thresholds, or baseline images
were changed. The original primary screenshot failure remains in the record.
